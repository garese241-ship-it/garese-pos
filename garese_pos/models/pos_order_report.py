from odoo import fields, models


class PosOrderReport(models.Model):
    _inherit = 'report.pos.order'

    gp_waiter_id = fields.Many2one('garese.pos.waiter', string='Waiter', readonly=True)

    def _select(self):
        return super()._select() + ', s.gp_waiter_id AS gp_waiter_id'

    def _group_by(self):
        return super()._group_by() + ', s.gp_waiter_id'
