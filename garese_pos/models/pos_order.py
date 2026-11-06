from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    gp_note = fields.Text(
        string='Customer Note',
        help="Note typed by the cashier on the payment screen and printed on the receipt.")

    gp_waiter_id = fields.Many2one(
        'garese.pos.waiter', string='Waiter', index='btree_not_null', ondelete='restrict',
        help="Waiter who serves the customers of this order (selected in the Point of Sale).")

    @api.model
    def _order_fields(self, ui_order):
        # Official extension point: order data coming from the Point of Sale.
        fields_ = super()._order_fields(ui_order)
        fields_['gp_note'] = ui_order.get('gp_note') or False
        fields_['gp_waiter_id'] = ui_order.get('gp_waiter_id') or False
        return fields_

    def _export_for_ui(self, order):
        # ... and going back to it (orders reloaded for a refund or a reprint).
        result = super()._export_for_ui(order)
        result['gp_note'] = order.gp_note or ''
        result['gp_waiter_id'] = order.gp_waiter_id.id or False
        return result
