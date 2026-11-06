{
    'name': 'GARESE POS',
    'version': '17.0.1.7.5',
    'category': 'Sales/Point of Sale',
    'summary': 'Modern Point of Sale interface: cart with pictures, colored '
               'categories, live stock, favorites, popular products, calculator',
    'description': """
GARESE POS
==========
A redesigned Point of Sale screen built on top of the standard Odoo POS
(sessions, offline mode, payments and accounting stay 100% native).

* Cart with product pictures, +/- quantity buttons and one-tap line removal
* Colored category tiles with icons and product counts
* Home view with the best-selling products of the shop
* Favorites, Promo and In-stock quick filters, sorting, grid / list views
* Live stock badge on every product
* Search bar, clock, connection status and cashier role in the top bar
* Bag button, manual code entry and built-in calculator
* Payment screen with one-tap banknote amounts, order recap and payment
  method icons; optional transaction reference (mobile money, cheque...)
* "Payment successful" screen with print, email and share actions
* Redesigned sales receipt (logo and address header, 4-column lines,
  optional tax line)
* Dashboard: turnover vs previous period, sales curve, payment methods,
  categories, best sellers, registers (open / continue / close), last
  transactions and live activity
* Waiters: list of waiters, selection on each order, printed on the receipt,
  sales analysis per waiter
""",
    'author': 'GARESE',
    'website': 'https://www.facebook.com/profile.php?id=61567181736290',
    'license': 'OPL-1',
    'depends': ['point_of_sale'],
    'data': [
        'security/garese_pos_groups.xml',
        'security/ir.model.access.csv',
        'security/garese_pos_security.xml',
        'views/pos_waiter_views.xml',
        'views/pos_dashboard_views.xml',
        'views/pos_cashier_control_views.xml',
        'views/pos_category_views.xml',
        'views/product_views.xml',
        'views/res_config_settings_views.xml',
        'views/pos_payment_method_views.xml',
        'views/pos_order_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'garese_pos/static/src/dashboard/dashboard.scss',
            'garese_pos/static/src/dashboard/dashboard.js',
            'garese_pos/static/src/dashboard/dashboard.xml',
        ],
        'point_of_sale._assets_pos': [
            # Brand colors must be known before Odoo's primary variables.
            ('after', 'web/static/src/scss/functions.scss',
             'garese_pos/static/src/scss/gp_primary_variables.scss'),
            'garese_pos/static/src/app/**/*',
            'garese_pos/static/src/scss/garese_pos.scss',
            'garese_pos/static/src/scss/garese_pos_payment.scss',
            'garese_pos/static/src/scss/garese_pos_receipt.scss',
            'garese_pos/static/src/scss/garese_pos_ambiance.scss',
        ],
    },
    'images': ['static/description/banner.png'],
    'installable': True,
    'application': False,
    'auto_install': False,
}
