from odoo import fields, models

from .pos_category import GP_CATEGORY_COLORS


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    gp_color = fields.Selection(
        GP_CATEGORY_COLORS, string='Icon Color',
        help="Color of the icon on the payment screen. Leave empty for the default "
             "color of the payment type (cash, bank, customer account).")
    gp_icon = fields.Char(
        string='Icon',
        help="Font Awesome 4 icon shown on the payment screen, e.g. fa-money, "
             "fa-credit-card, fa-mobile, fa-university. Leave empty for the default icon. "
             "When the payment method has an image, the image is shown instead.")
    gp_ask_reference = fields.Boolean(
        string='Ask for a Transaction Reference',
        help="The cashier must type the reference of the transaction (mobile money, "
             "transfer, cheque number...) when this payment method is used. The reference "
             "is stored on the payment and printed on the receipt.")
