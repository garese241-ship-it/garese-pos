from collections import defaultdict

from odoo import fields, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    # ------------------------------------------------------------------
    # Data sent to the Point of Sale
    # ------------------------------------------------------------------
    def _pos_ui_models_to_load(self):
        models_to_load = super()._pos_ui_models_to_load()
        if self.config_id.gp_use_waiter:
            models_to_load.append('garese.pos.waiter')
        return models_to_load

    def _loader_params_garese_pos_waiter(self):
        return {
            'search_params': {
                'domain': [
                    ('company_id', 'in', (False, self.company_id.id)),
                    '|', ('pos_config_ids', '=', False), ('pos_config_ids', 'in', self.config_id.ids),
                ],
                'fields': ['name'],
            },
        }

    def _get_pos_ui_garese_pos_waiter(self, params):
        return self.env['garese.pos.waiter'].search_read(**params['search_params'])

    def _loader_params_pos_category(self):
        params = super()._loader_params_pos_category()
        params['search_params']['fields'] += ['sequence', 'gp_color', 'gp_icon']
        return params

    def _loader_params_product_product(self):
        params = super()._loader_params_product_product()
        params['search_params']['fields'] += ['type', 'gp_pos_favorite']
        return params

    def _loader_params_pos_payment_method(self):
        params = super()._loader_params_pos_payment_method()
        params['search_params']['fields'] += ['gp_color', 'gp_icon', 'gp_ask_reference']
        return params

    def _loader_params_res_company(self):
        # Address lines of the receipt header.
        params = super()._loader_params_res_company()
        params['search_params']['fields'] += ['street', 'city']
        return params

    def _process_pos_ui_product_product(self, products):
        """Official extension point: runs for the initial load as well as for
        every product fetched later (search in database, barcode, ...)."""
        super()._process_pos_ui_product_product(products)
        if not products:
            return
        product_ids = [product['id'] for product in products]
        stock = self._gp_get_stock(product_ids) if self.config_id.gp_show_stock else {}
        ranks = self._gp_get_popular_ranks()
        for product in products:
            product['gp_qty'] = stock.get(product['id'], 0.0)
            product['gp_popular_rank'] = ranks.get(product['id'], 0)

    # ------------------------------------------------------------------
    # Stock
    # ------------------------------------------------------------------
    def gp_get_stock(self, product_ids):
        """RPC entry point used by the Point of Sale to refresh stock badges."""
        self.ensure_one()
        if not self.config_id.gp_show_stock:
            return {}
        # JSON object keys are strings anyway: be explicit about it.
        return {str(pid): qty for pid, qty in self._gp_get_stock(product_ids).items()}

    def _gp_get_stock(self, product_ids):
        """Quantity really left on the shelf of this Point of Sale.

        = quantity on hand in the source location of the Point of Sale
          - quantities already sold in sessions that only post their stock
            moves at closing (Odoo's default) and are still open.
        Without the second term the badge would not move until the session
        is closed.
        """
        self.ensure_one()
        location = self.config_id.picking_type_id.default_location_src_id
        if not product_ids or not location:
            return {}
        Product = self.env['product.product'].sudo().with_context(
            location=location.id, active_test=False)
        storable = Product.search([('id', 'in', product_ids), ('type', '=', 'product')])
        if not storable:
            return {}
        quantities = {product.id: product.qty_available for product in storable}

        pending = self.env['pos.order.line'].sudo()._read_group(
            [
                ('product_id', 'in', storable.ids),
                ('order_id.state', 'in', ('paid', 'done', 'invoiced')),
                ('order_id.picking_ids', '=', False),
                ('order_id.session_id.state', '!=', 'closed'),
                ('order_id.session_id.update_stock_at_closing', '=', True),
                ('order_id.config_id.picking_type_id.default_location_src_id', '=', location.id),
            ],
            ['product_id'], ['qty:sum'],
        )
        for product, qty in pending:
            quantities[product.id] -= qty
        return quantities

    # ------------------------------------------------------------------
    # Popular products
    # ------------------------------------------------------------------
    def _gp_get_popular_ranks(self):
        """{product_id: rank} of the best sellers of this Point of Sale,
        rank 1 being the best seller. Empty when the feature is disabled or
        when nothing was sold on the period."""
        self.ensure_one()
        config = self.config_id
        if not config.gp_popular_limit:
            return {}
        domain = [
            ('order_id.config_id', '=', config.id),
            ('order_id.state', 'in', ('paid', 'done', 'invoiced')),
            ('qty', '>', 0),
            ('product_id.available_in_pos', '=', True),
            ('product_id', 'not in', self.env['pos.config']._get_special_products().ids),
        ]
        if config.gp_popular_days:
            date_from = fields.Datetime.subtract(fields.Datetime.now(), days=config.gp_popular_days)
            domain.append(('order_id.date_order', '>=', date_from))
        groups = self.env['pos.order.line'].sudo()._read_group(
            domain, ['product_id'], ['qty:sum'],
            order='qty:sum desc, product_id', limit=config.gp_popular_limit,
        )
        ranks = defaultdict(int)
        for rank, (product, _qty) in enumerate(groups, start=1):
            ranks[product.id] = rank
        return dict(ranks)
