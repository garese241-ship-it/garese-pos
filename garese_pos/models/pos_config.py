import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    gp_show_stock = fields.Boolean(
        string='Show Stock on Products', default=True,
        help="Display the quantity on hand of storable products in the Point of Sale.")
    gp_low_stock_threshold = fields.Float(
        string='Low Stock Threshold', default=5.0,
        help="At or below this quantity the stock badge turns orange.")
    gp_stock_refresh_minutes = fields.Integer(
        string='Stock Refresh (minutes)', default=5,
        help="How often the Point of Sale re-reads the stock from the server, "
             "to reflect sales made on other registers. 0 disables the refresh.")
    gp_popular_limit = fields.Integer(
        string='Number of Popular Products', default=12,
        help="Number of best sellers shown on the home view. 0 hides the section.")
    gp_popular_days = fields.Integer(
        string='Popularity Period (days)', default=30,
        help="Best sellers are computed on the sales of this Point of Sale "
             "over this number of days.")
    gp_promo_first = fields.Boolean(
        string='Promotions First', default=True,
        help="Products sold below their public price by the pricelist (promotions, "
             "set for a period with the pricelist dates) are shown first on the home "
             "view each time the Point of Sale opens, with their discount and old price.")
    gp_show_brand = fields.Boolean(
        string='Brand on Products', default=True,
        help="Show the brand on the product cards of the Point of Sale and find the products "
             "by brand from the search field. Needs the Product Brands option.")
    gp_bag_product_id = fields.Many2one(
        'product.product', string='Bag Product',
        domain="[('available_in_pos', '=', True), ('sale_ok', '=', True)]",
        help="Product added to the order by the Bag button. "
             "Leave empty to hide the button.")
    gp_favorite_manager_only = fields.Boolean(
        string='Only Managers Edit Favorites',
        help="When enabled, only Point of Sale managers can star / unstar products "
             "from the Point of Sale.")

    gp_use_waiter = fields.Boolean(
        string='Waiters on Orders',
        help="Let the cashier select, on each order, the waiter who serves the customers. "
             "The waiter is printed on the receipt and available in the sales analysis.")
    gp_waiter_required = fields.Boolean(
        string='Waiter Required',
        help="An order cannot be paid before a waiter is selected.")
    gp_receipt_show_tax = fields.Boolean(
        string='Taxes on the Receipt',
        help="Print the tax line on the receipt. When disabled, the receipt shows "
             "tax-included amounts only: subtotal, discount and total.")

    gp_receipt_font = fields.Selection(
        [('normal', 'Normal'), ('large', 'Large'), ('xlarge', 'Extra large')],
        string='Receipt Text Size', default='large', required=True,
        help="Size of the text printed on the receipts, bills and preparation tickets. "
             "The width of the paper does not change: with a larger text, long product "
             "names take more lines.")

    # Cashier restrictions
    gp_close_requires_manager = fields.Boolean(
        string='Closing Authorized by a Manager',
        help="A cashier can only close the session after a manager of the Point of Sale "
             "typed his Odoo password on the register. The manager who authorized the "
             "closing is recorded on the session.")
    gp_hide_paid_orders = fields.Boolean(
        string='Hide Paid Orders from Cashiers',
        help="Cashiers keep their ongoing orders and the paid orders of the current "
             "session (to reprint a ticket). Paid orders of earlier sessions are hidden "
             "unless a manager types his password.")
    gp_hide_closing_totals = fields.Boolean(
        string='Hide Totals from Cashiers',
        help="The closing screen no longer shows the expected amounts, the differences "
             "and the sales report to cashiers: they only count the cash. Everything "
             "appears once a manager types his password.")

    gp_ambiance = fields.Selection(
        [('bright', 'Bright'), ('soft', 'Soft'), ('dim', 'Dimmed')],
        string='Screen Ambiance', default='soft', required=True,
        help="Brightness of the backgrounds of the Point of Sale. Soft and Dimmed replace "
             "the white areas with a calm, darker tone that is easier on the eyes; "
             "Bright is the white interface. Printed receipts are not affected.")

    gp_quick_amounts = fields.Char(
        string='Quick Amounts', default='5000, 10000, 20000, 50000, 100000, 200000, 500000',
        help="Amounts offered as one-tap buttons on the payment screen (typically the "
             "banknotes in circulation), separated by commas. Leave empty to hide them.")
    gp_numpad_increments = fields.Char(
        string='Numpad Increments', default='10000, 20000, 50000',
        help="The three '+' keys of the payment numpad, separated by commas. "
             "Leave empty to keep Odoo's +10 / +20 / +50.")

    # ------------------------------------------------------------------
    # Interactive Point of Sale (1.10.0)
    # ------------------------------------------------------------------
    gp_fx_animations = fields.Boolean(
        string='Animations', default=True,
        help="The product flies to the cart when added, the counters pulse and the "
             "payment confirmation is animated.")
    gp_fx_sounds = fields.Boolean(
        string='Sounds',
        help="Soft sounds when a product is added, when a payment succeeds and on errors.")
    gp_suggestions = fields.Boolean(
        string='Often Bought Together', default=True,
        help="After a product is added, suggest the products most often sold in the same "
             "order (computed on the last 90 days of this Point of Sale).")
    gp_customer_card = fields.Boolean(
        string='Customer Card', default=True,
        help="Show a quick card for the selected customer: total spent, last visit, "
             "favorite products, VIP and birthday flags.")
    gp_vip_threshold = fields.Float(
        string='VIP Threshold',
        help="A customer who spent at least this amount in this Point of Sale is flagged VIP. "
             "0 disables the flag.")
    gp_loyalty_every = fields.Integer(
        string='Reward Every N Purchases',
        help="Shows the cashier how many purchases are left before the customer's reward. "
             "0 disables the progress bar.")
    gp_loyalty_reward = fields.Char(
        string='Reward Text', default='a reward',
        help="What the customer gets, for example: 10% off, a free item.")
    gp_daily_goal = fields.Float(
        string='Daily Goal',
        help="Sales target of the day for this Point of Sale. A progress bar is shown on the "
             "home view. 0 hides it.")
    gp_theme = fields.Selection(
        [('violet', 'Violet'), ('green', 'Green'), ('blue', 'Blue'),
         ('orange', 'Orange'), ('rose', 'Rose')],
        string='Color Theme', default='violet', required=True,
        help="Main color of the Point of Sale screens.")
    gp_tile_size = fields.Selection(
        [('compact', 'Compact'), ('normal', 'Normal'), ('large', 'Large')],
        string='Product Tile Size', default='normal', required=True,
        help="Size of the product tiles: compact shows more products, large is easier to touch.")
    gp_logo = fields.Image(
        string='Navbar Logo', max_width=256, max_height=96,
        help="Logo shown in the top bar of this Point of Sale instead of its name.")

    # ------------------------------------------------------------------
    # Data for the register (called by the Point of Sale)
    # ------------------------------------------------------------------
    @api.model
    def gp_affinity(self, config_id, days=90, top=3):
        """Products most often sold in the same order as each product.

        :return: {product_id: [product_id, ...]} (at most `top` per product)
        """
        config = self.browse(config_id).exists()
        if not config:
            return {}
        self.env.cr.execute("""
            SELECT a.product_id, b.product_id, COUNT(DISTINCT a.order_id) AS hits
              FROM pos_order_line a
              JOIN pos_order_line b ON b.order_id = a.order_id AND b.product_id <> a.product_id
              JOIN pos_order o ON o.id = a.order_id
              JOIN pos_session s ON s.id = o.session_id
             WHERE s.config_id = %s
               AND o.state IN ('paid', 'done')
               AND o.date_order >= (now() at time zone 'utc') - (%s || ' days')::interval
             GROUP BY a.product_id, b.product_id
             ORDER BY a.product_id, hits DESC, b.product_id
        """, (config.id, str(int(days))))
        result = {}
        for product_id, other_id, _hits in self.env.cr.fetchall():
            bucket = result.setdefault(product_id, [])
            if len(bucket) < top:
                bucket.append(other_id)
        return result

    @api.model
    def gp_today_sales(self, config_id):
        """Turnover of the day (paid orders of this Point of Sale, UTC day of the user)."""
        config = self.browse(config_id).exists()
        if not config:
            return 0.0
        tz = self.env.user.tz or 'UTC'
        self.env.cr.execute("""
            SELECT COALESCE(SUM(o.amount_total), 0)
              FROM pos_order o
              JOIN pos_session s ON s.id = o.session_id
             WHERE s.config_id = %s
               AND o.state IN ('paid', 'done')
               AND (o.date_order at time zone 'utc' at time zone %s)::date
                   = (now() at time zone %s)::date
        """, (config.id, tz, tz))
        return float(self.env.cr.fetchone()[0] or 0.0)

    @api.model
    def _gp_parse_amounts(self, text):
        """'5000, 10 000;20000' -> [5000.0, 10000.0, 20000.0]. Raises ValueError."""
        amounts = []
        for chunk in re.split(r'[;,]', text or ''):
            chunk = re.sub(r'\s', '', chunk)
            if not chunk:
                continue
            amount = float(chunk)
            if amount <= 0:
                raise ValueError(chunk)
            amounts.append(amount)
        return amounts

    @api.constrains('gp_quick_amounts', 'gp_numpad_increments')
    def _check_gp_amounts(self):
        for config in self:
            try:
                self._gp_parse_amounts(config.gp_quick_amounts)
                increments = self._gp_parse_amounts(config.gp_numpad_increments)
            except ValueError:
                raise ValidationError(_(
                    "Quick amounts and numpad increments must be positive numbers "
                    "separated by commas, for example: 5000, 10000, 20000."))
            if increments and len(increments) != 3:
                raise ValidationError(_("The payment numpad has exactly three '+' keys: "
                                        "enter three increments, or leave the field empty."))

    _gp_popular_limit_positive = models.Constraint(
        'CHECK(gp_popular_limit >= 0)',
        'The number of popular products cannot be negative.',
    )
    _gp_popular_days_positive = models.Constraint(
        'CHECK(gp_popular_days >= 0)',
        'The popularity period cannot be negative.',
    )
    _gp_stock_refresh_positive = models.Constraint(
        'CHECK(gp_stock_refresh_minutes >= 0)',
        'The stock refresh delay cannot be negative.',
    )
