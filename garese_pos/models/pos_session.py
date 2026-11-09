from collections import defaultdict

from odoo import api, fields, models

PAID_STATES = ('paid', 'done')


class PosSession(models.Model):
    _inherit = 'pos.session'

    # ------------------------------------------------------------------
    # Data sent to the Point of Sale
    # ------------------------------------------------------------------
    @api.model
    def _load_pos_data_models(self, config):
        # Always loaded: pos.order and product.template point to them (the
        # domain of the waiters is empty when the feature is disabled).
        return super()._load_pos_data_models(config) + ['garese.pos.waiter', 'gp.brand']

    # ------------------------------------------------------------------
    # Stock
    # ------------------------------------------------------------------
    def gp_get_stock(self, template_ids):
        """RPC entry point used by the Point of Sale to refresh stock badges.

        :param template_ids: ids of product.template (the Point of Sale
            displays templates since Odoo 18)
        :return: {"template_id": qty}
        """
        self.ensure_one()
        if not self.config_id.gp_show_stock:
            return {}
        return {str(tid): qty for tid, qty in self._gp_get_stock(template_ids).items()}

    def _gp_get_stock(self, template_ids):
        """Quantity really left on the shelf of this Point of Sale, per template.

        = quantity on hand in the source location of the Point of Sale
          - quantities already sold in sessions that only post their stock
            moves at closing (Odoo's default) and are still open.
        Without the second term the badge would not move until the session
        is closed.
        """
        self.ensure_one()
        location = self.config_id.picking_type_id.default_location_src_id
        if not template_ids or not location:
            return {}
        Product = self.env['product.product'].sudo().with_context(
            location=location.id, active_test=False)
        storable = Product.search([
            ('product_tmpl_id', 'in', list(template_ids)), ('is_storable', '=', True)])
        if not storable:
            return {}
        quantities = defaultdict(float)
        for product in storable:
            quantities[product.product_tmpl_id.id] += product.qty_available

        pending = self.env['pos.order.line'].sudo()._read_group(
            [
                ('product_id', 'in', storable.ids),
                ('order_id.state', 'in', PAID_STATES),
                ('order_id.picking_ids', '=', False),
                ('order_id.session_id.state', '!=', 'closed'),
                ('order_id.session_id.update_stock_at_closing', '=', True),
                ('order_id.config_id.picking_type_id.default_location_src_id', '=', location.id),
            ],
            ['product_id'], ['qty:sum'],
        )
        for product, qty in pending:
            quantities[product.product_tmpl_id.id] -= qty
        return dict(quantities)

    # ------------------------------------------------------------------
    # Popular products
    # ------------------------------------------------------------------
    def _gp_get_popular_ranks(self):
        """{template_id: rank} of the best sellers of this Point of Sale,
        rank 1 being the best seller. Empty when the feature is disabled or
        when nothing was sold on the period."""
        self.ensure_one()
        config = self.config_id
        if not config.gp_popular_limit:
            return {}
        domain = [
            ('order_id.config_id', '=', config.id),
            ('order_id.state', 'in', PAID_STATES),
            ('qty', '>', 0),
            ('product_id.available_in_pos', '=', True),
            ('product_id', 'not in', self.env['pos.config']._get_special_products().ids),
        ]
        if config.gp_popular_days:
            date_from = fields.Datetime.subtract(fields.Datetime.now(), days=config.gp_popular_days)
            domain.append(('order_id.date_order', '>=', date_from))
        groups = self.env['pos.order.line'].sudo()._read_group(
            domain, ['product_id'], ['qty:sum'], order='qty:sum desc, product_id',
        )
        ranks = {}
        for product, _qty in groups:
            template_id = product.product_tmpl_id.id
            if template_id not in ranks:
                ranks[template_id] = len(ranks) + 1
            if len(ranks) >= config.gp_popular_limit:
                break
        return ranks


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def _load_pos_data_fields(self, config):
        fields_ = super()._load_pos_data_fields(config)
        return fields_ + ['gp_pos_favorite', 'gp_brand_id'] if fields_ else fields_

    @api.model
    def _load_pos_data_read(self, records, config):
        """Stock and popularity travel with the products (initial load and
        every product fetched later): "_" keys are kept as raw values."""
        read_records = super()._load_pos_data_read(records, config)
        if not read_records:
            return read_records
        session = config.current_session_id
        template_ids = [record['id'] for record in read_records]
        stock = session._gp_get_stock(template_ids) if session and config.gp_show_stock else {}
        ranks = session._gp_get_popular_ranks() if session else {}
        for record in read_records:
            record['_gp_qty'] = stock.get(record['id'], 0.0)
            record['_gp_popular_rank'] = ranks.get(record['id'], 0)
        return read_records


class PosCategory(models.Model):
    _inherit = 'pos.category'

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ['gp_color', 'gp_icon']


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ['gp_color', 'gp_icon', 'gp_ask_reference']
