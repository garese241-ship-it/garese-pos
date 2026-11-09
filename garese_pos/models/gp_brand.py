from odoo import api, fields, models


class GpBrand(models.Model):
    _name = 'gp.brand'
    _inherit = ['pos.load.mixin']
    _description = 'Product Brand'
    _order = 'name'

    name = fields.Char(required=True)
    image = fields.Image(max_width=256, max_height=256)
    active = fields.Boolean(default=True)
    product_count = fields.Integer(compute='_compute_product_count')

    _name_uniq = models.Constraint('unique(name)', "This brand already exists.")

    def _compute_product_count(self):
        counts = dict(self.env['product.template']._read_group(
            [('gp_brand_id', 'in', self.ids)], ['gp_brand_id'], ['__count']))
        for brand in self:
            brand.product_count = counts.get(brand, 0)

    def action_view_products(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.name,
            'res_model': 'product.template',
            'view_mode': 'list,form,kanban',
            'domain': [('gp_brand_id', '=', self.id)],
            'context': {'default_gp_brand_id': self.id},
        }

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name']
