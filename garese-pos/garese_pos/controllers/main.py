from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import Home


class GpHome(Home):
    """Cashiers without back-office: /web opens their register directly."""

    @http.route()
    def web_client(self, s_action=None, **kw):
        uid = request.session.uid
        if uid and not kw.get('debug'):
            user = request.env['res.users'].browse(uid)
            if user._gp_is_cashier_only():
                session = request.env['pos.session'].sudo().search([
                    ('state', 'in', ('opening_control', 'opened')),
                    ('user_id', '=', uid),
                    ('rescue', '=', False),
                ], limit=1)
                if session:
                    return request.redirect('/pos/ui?config_id=%d' % session.config_id.id)
        return super().web_client(s_action=s_action, **kw)
