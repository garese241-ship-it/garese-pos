"""Cashier restrictions: closing authorized by a manager's password, paid orders
and totals hidden from cashiers, cashiers without back-office."""
import logging
from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import AccessDenied, UserError
from odoo.http import request

_logger = logging.getLogger(__name__)

# How long a manager's authorization stays valid on the register.
GP_AUTHORIZATION_MINUTES = 10


class PosSession(models.Model):
    _inherit = 'pos.session'

    gp_auth_user_id = fields.Many2one(
        'res.users', string='Last Manager Authorization', readonly=True, copy=False)
    gp_auth_until = fields.Datetime(string='Authorization Valid Until', readonly=True, copy=False)
    gp_closing_authorized_by_id = fields.Many2one(
        'res.users', string='Closing Authorized By', readonly=True, copy=False,
        help="Manager who typed his password to let the cashier close the session.")

    # ------------------------------------------------------------------
    # Authorization
    # ------------------------------------------------------------------
    def _gp_is_manager(self, user=None):
        self.ensure_one()
        user = user or self.env.user
        group = self.config_id.group_pos_manager_id or self.env.ref('point_of_sale.group_pos_manager')
        return group in user.all_group_ids

    def _gp_authorized(self):
        """Is the current user allowed to do what a manager does on this session?"""
        self.ensure_one()
        if self.env.su or self._gp_is_manager():
            return True
        return bool(self.gp_auth_user_id and self.gp_auth_until
                    and self.gp_auth_until >= fields.Datetime.now())

    def gp_get_managers(self):
        """Managers who may authorize on this register (names only)."""
        self.ensure_one()
        group = self.config_id.group_pos_manager_id or self.env.ref('point_of_sale.group_pos_manager')
        users = group.sudo().all_user_ids.filtered(
            lambda u: u.active and self.company_id in u.company_ids and not u.share)
        return [{'id': u.id, 'name': u.name} for u in users.sorted('name')]

    def _gp_verify_manager(self, user_id, password, purpose=''):
        """Check the Odoo password of a manager typed on the register.

        Uses the standard login check, so the protection against repeated
        failures of Odoo (login cooldown) applies.
        Returns (manager, None) when accepted, (None, error dict) otherwise.
        """
        self.ensure_one()
        wrong = {'ok': False, 'message': _("Wrong password.")}
        manager = self.env['res.users'].sudo().browse(int(user_id or 0)).exists()
        if not manager or not password or not self._gp_is_manager(manager) \
                or self.company_id not in manager.company_ids:
            return None, wrong
        try:
            auth_info = self.env['res.users'].authenticate(
                {'type': 'password', 'login': manager.login, 'password': password},
                {'interactive': True})
            uid = auth_info.get('uid')
        except AccessDenied as error:
            message = str(error.args[0]) if error.args and error.args[0] != 'Access Denied' else None
            _logger.info("POS %s: refused manager authorization (%s) for %s",
                         self.name, purpose, manager.login)
            return None, {'ok': False, 'message': message or wrong['message']}
        if uid != manager.id:
            return None, wrong
        return manager, None

    def gp_manager_authorize(self, user_id, password, purpose='closing'):
        """Manager's password on the register: valid GP_AUTHORIZATION_MINUTES."""
        self.ensure_one()
        manager, error = self._gp_verify_manager(user_id, password, purpose)
        if error:
            return error
        until = fields.Datetime.now() + timedelta(minutes=GP_AUTHORIZATION_MINUTES)
        self.sudo().write({'gp_auth_user_id': manager.id, 'gp_auth_until': until})
        labels = {'closing': _("closing of the session"), 'orders': _("access to the paid orders")}
        self.sudo().message_post(body=_(
            "%(manager)s authorized the %(what)s for %(cashier)s.",
            manager=manager.name, what=labels.get(purpose, purpose), cashier=self.env.user.name))
        return {'ok': True, 'name': manager.name, 'until': fields.Datetime.to_string(until)}

    def _gp_check_closing(self):
        """Raise when the closing needs a manager and none authorized it."""
        for session in self:
            if not session.config_id.gp_close_requires_manager or session._gp_authorized():
                continue
            raise UserError(_("The closing of the session must be authorized by a manager."))

    def _gp_record_closing_authorization(self):
        for session in self:
            if session.config_id.gp_close_requires_manager and not session.gp_closing_authorized_by_id:
                manager = self.env.user if session._gp_is_manager() else session.gp_auth_user_id
                if manager:
                    session.sudo().gp_closing_authorized_by_id = manager

    # ------------------------------------------------------------------
    # Closing: every way to close goes through one of these
    # ------------------------------------------------------------------
    def get_closing_control_data(self):
        data = super().get_closing_control_data()
        # a manager authorized the closing: he may accept a cash difference
        if self.config_id.gp_close_requires_manager and self._gp_authorized():
            data['is_manager'] = True
        # hidden from the cashier until a manager typed his password (or is the user)
        data['gp_show_totals'] = (not self.config_id.gp_hide_closing_totals
                                  or self._gp_authorized())
        return data

    def post_closing_cash_details(self, counted_cash):
        try:
            self._gp_check_closing()
        except UserError as error:
            return {'successful': False, 'message': error.args[0], 'redirect': False}
        return super().post_closing_cash_details(counted_cash)

    def update_closing_control_state_session(self, notes):
        self._gp_check_closing()
        return super().update_closing_control_state_session(notes)

    def close_session_from_ui(self, bank_payment_method_diff_pairs=None):
        try:
            self._gp_check_closing()
        except UserError as error:
            return {'successful': False, 'message': error.args[0], 'redirect': False}
        self._gp_record_closing_authorization()
        return super().close_session_from_ui(bank_payment_method_diff_pairs)

    def action_pos_session_closing_control(self, balancing_account=False, amount_to_balance=0,
                                           bank_payment_method_diffs=None):
        self._gp_check_closing()
        self._gp_record_closing_authorization()
        return super().action_pos_session_closing_control(
            balancing_account, amount_to_balance, bank_payment_method_diffs)

class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def search_paid_order_ids(self, config_id, domain, limit, offset):
        config = self.env['pos.config'].browse(config_id)
        if config.gp_hide_paid_orders:
            session = self.env['pos.session'].search(
                [('config_id', '=', config.id), ('state', 'in', ('opening_control', 'opened', 'closing_control'))],
                limit=1)
            authorized = session._gp_authorized() if session else (
                self.env.su or config.group_pos_manager_id in self.env.user.all_group_ids)
            if not authorized:
                if not session:
                    return {'ordersInfo': [], 'totalCount': 0}
                # the cashier keeps the paid orders of today's session (reprint);
                # older orders need a manager
                domain = list(domain or []) + [('session_id', '=', session.id)]
        return super().search_paid_order_ids(config_id, domain, limit, offset)


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def _load_pos_data_fields(self, config):
        fields_ = super()._load_pos_data_fields(config)
        return fields_ + ['gp_pos_cashier_only'] if fields_ else fields_

    gp_pos_cashier_only = fields.Boolean(
        string='Cash Register Only',
        compute='_compute_gp_pos_cashier_only', inverse='_inverse_gp_pos_cashier_only',
        help="After login, the user goes straight to the Point of Sale and has no Odoo menu. "
             "Not applied to Point of Sale managers.")

    def _compute_gp_pos_cashier_only(self):
        group = self.env.ref('garese_pos.gp_group_pos_cashier_only')
        for user in self:
            user.gp_pos_cashier_only = group in user.group_ids

    def _inverse_gp_pos_cashier_only(self):
        group = self.env.ref('garese_pos.gp_group_pos_cashier_only')
        for user in self:
            user.group_ids = [(4 if user.gp_pos_cashier_only else 3, group.id)]

    def _gp_is_cashier_only(self):
        self.ensure_one()
        # has_group() only works on the user of the environment: read the groups
        groups = self.sudo().all_group_ids
        ref = lambda xmlid: self.env.ref(xmlid, raise_if_not_found=False)
        return (ref('garese_pos.gp_group_pos_cashier_only') in groups
                and ref('point_of_sale.group_pos_manager') not in groups
                and ref('base.group_system') not in groups)


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _visible_menu_ids(self, debug=False):
        # the cache of the parent is keyed on the groups of the user: safe here
        if self.env.user._gp_is_cashier_only():
            return frozenset()
        return super()._visible_menu_ids(debug)


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        info = super().session_info()
        user = self.env.user
        if request and request.session.uid and user._gp_is_cashier_only():
            action = self.env.ref('garese_pos.action_gp_dashboard', raise_if_not_found=False)
            if action:
                info['home_action_id'] = action.id
        return info
