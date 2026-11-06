from odoo import fields, models

GP_CATEGORY_COLORS = [
    ('blue', 'Blue'),
    ('green', 'Green'),
    ('orange', 'Orange'),
    ('red', 'Red'),
    ('purple', 'Purple'),
    ('teal', 'Teal'),
    ('pink', 'Pink'),
    ('yellow', 'Yellow'),
    ('grey', 'Grey'),
]


class PosCategory(models.Model):
    _inherit = 'pos.category'

    gp_color = fields.Selection(
        GP_CATEGORY_COLORS, string='Tile Color',
        help="Color of the category tile in the Point of Sale. "
             "Leave empty to let the Point of Sale pick one automatically.")
    gp_icon = fields.Char(
        string='Tile Icon',
        help="Font Awesome 4 icon shown on the category tile, e.g. fa-coffee, "
             "fa-leaf, fa-snowflake-o. Leave empty for the default icon. "
             "When the category has an image and category images are enabled "
             "in the Point of Sale, the image is shown instead.")
