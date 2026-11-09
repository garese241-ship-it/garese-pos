from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # Both fields are part of the Point of Sale data (pos.order loads all its
    # fields): they are synchronized with the register without extra code.
    gp_note = fields.Text(
        string='Customer Note',
        help="Note typed by the cashier on the payment screen and printed on the receipt.")

    gp_waiter_id = fields.Many2one(
        'garese.pos.waiter', string='Waiter', index='btree_not_null', ondelete='restrict',
        help="Waiter who serves the customers of this order (selected in the Point of Sale).")
