from odoo import _, fields, models
from odoo.exceptions import AccessError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    gp_pos_favorite = fields.Boolean(
        string='POS Favorite',
        help="Favorite products are reachable in one tap from the "
             "Favorites filter of the Point of Sale.")


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def gp_set_pos_favorite(self, favorite):
        """Called from the Point of Sale when a cashier (un)stars a product.

        Cashiers only have read access on products, hence the sudo(); the
        method is limited to that single flag and to Point of Sale users.
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Only Point of Sale users can change favorite products."))
        self.sudo().product_tmpl_id.write({'gp_pos_favorite': bool(favorite)})
        return True
