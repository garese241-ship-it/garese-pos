from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_gp_show_stock = fields.Boolean(related='pos_config_id.gp_show_stock', readonly=False)
    pos_gp_low_stock_threshold = fields.Float(related='pos_config_id.gp_low_stock_threshold', readonly=False)
    pos_gp_stock_refresh_minutes = fields.Integer(related='pos_config_id.gp_stock_refresh_minutes', readonly=False)
    pos_gp_promo_first = fields.Boolean(related='pos_config_id.gp_promo_first', readonly=False)
    group_gp_brand = fields.Boolean(
        string='Product Brands', implied_group='garese_pos.gp_group_brand',
        help="Adds the Brand field on the products and the list of brands.")
    pos_gp_show_brand = fields.Boolean(related='pos_config_id.gp_show_brand', readonly=False)
    pos_gp_popular_limit = fields.Integer(related='pos_config_id.gp_popular_limit', readonly=False)
    pos_gp_popular_days = fields.Integer(related='pos_config_id.gp_popular_days', readonly=False)
    pos_gp_bag_product_id = fields.Many2one(related='pos_config_id.gp_bag_product_id', readonly=False)
    pos_gp_favorite_manager_only = fields.Boolean(related='pos_config_id.gp_favorite_manager_only', readonly=False)
    pos_gp_use_waiter = fields.Boolean(related='pos_config_id.gp_use_waiter', readonly=False)
    pos_gp_waiter_required = fields.Boolean(related='pos_config_id.gp_waiter_required', readonly=False)
    pos_gp_receipt_show_tax = fields.Boolean(related='pos_config_id.gp_receipt_show_tax', readonly=False)
    pos_gp_receipt_font = fields.Selection(related='pos_config_id.gp_receipt_font', readonly=False)
    pos_gp_ambiance = fields.Selection(related='pos_config_id.gp_ambiance', readonly=False)
    pos_gp_close_requires_manager = fields.Boolean(related='pos_config_id.gp_close_requires_manager', readonly=False)
    pos_gp_hide_paid_orders = fields.Boolean(related='pos_config_id.gp_hide_paid_orders', readonly=False)
    pos_gp_hide_closing_totals = fields.Boolean(related='pos_config_id.gp_hide_closing_totals', readonly=False)
    pos_gp_quick_amounts = fields.Char(related='pos_config_id.gp_quick_amounts', readonly=False)
    pos_gp_numpad_increments = fields.Char(related='pos_config_id.gp_numpad_increments', readonly=False)
    pos_gp_fx_animations = fields.Boolean(related='pos_config_id.gp_fx_animations', readonly=False)
    pos_gp_fx_sounds = fields.Boolean(related='pos_config_id.gp_fx_sounds', readonly=False)
    pos_gp_suggestions = fields.Boolean(related='pos_config_id.gp_suggestions', readonly=False)
    pos_gp_customer_card = fields.Boolean(related='pos_config_id.gp_customer_card', readonly=False)
    pos_gp_vip_threshold = fields.Float(related='pos_config_id.gp_vip_threshold', readonly=False)
    pos_gp_loyalty_every = fields.Integer(related='pos_config_id.gp_loyalty_every', readonly=False)
    pos_gp_loyalty_reward = fields.Char(related='pos_config_id.gp_loyalty_reward', readonly=False)
    pos_gp_daily_goal = fields.Float(related='pos_config_id.gp_daily_goal', readonly=False)
    pos_gp_theme = fields.Selection(related='pos_config_id.gp_theme', readonly=False)
    pos_gp_tile_size = fields.Selection(related='pos_config_id.gp_tile_size', readonly=False)
    pos_gp_logo = fields.Binary(related='pos_config_id.gp_logo', readonly=False)
