from odoo import api, fields, models


class GaresePosWaiter(models.Model):
    _name = 'garese.pos.waiter'
    _description = 'Point of Sale Waiter'
    _order = 'sequence, name, id'

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company', string='Company', default=lambda self: self.env.company)
    pos_config_ids = fields.Many2many(
        'pos.config', 'garese_pos_waiter_pos_config_rel', 'waiter_id', 'config_id',
        string='Points of Sale',
        help="Points of Sale where this waiter can be selected. Leave empty for all of them.")
    order_count = fields.Integer(string='Orders', compute='_compute_order_count')

    def _compute_order_count(self):
        counts = dict(self.env['pos.order']._read_group(
            [('gp_waiter_id', 'in', self.ids)], ['gp_waiter_id'], ['__count']))
        for waiter in self:
            waiter.order_count = counts.get(waiter, 0)

    def action_view_orders(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('point_of_sale.action_pos_pos_form')
        action['domain'] = [('gp_waiter_id', '=', self.id)]
        action['context'] = {'default_gp_waiter_id': self.id}
        return action
