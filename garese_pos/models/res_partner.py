from datetime import date

from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    gp_birthday = fields.Date(
        string='Birthday',
        help="Shown on the customer card of the Point of Sale (flag on the day).")

    @api.model
    def gp_customer_card(self, partner_id, config_id):
        """Figures of a customer for the register: spending, visits, favorites."""
        partner = self.browse(partner_id).exists()
        config = self.env['pos.config'].browse(config_id).exists()
        if not partner or not config:
            return {}
        self.env.cr.execute("""
            SELECT COUNT(*), COALESCE(SUM(o.amount_total), 0), MAX(o.date_order)
              FROM pos_order o
              JOIN pos_session s ON s.id = o.session_id
             WHERE s.config_id = %s AND o.partner_id = %s
               AND o.state IN ('paid', 'done')
        """, (config.id, partner.id))
        visits, spent, last = self.env.cr.fetchone()
        self.env.cr.execute("""
            SELECT l.product_id, SUM(l.qty) AS qty
              FROM pos_order_line l
              JOIN pos_order o ON o.id = l.order_id
              JOIN pos_session s ON s.id = o.session_id
             WHERE s.config_id = %s AND o.partner_id = %s AND l.qty > 0
               AND o.state IN ('paid', 'done')
             GROUP BY l.product_id ORDER BY qty DESC, l.product_id LIMIT 3
        """, (config.id, partner.id))
        favorites = [row[0] for row in self.env.cr.fetchall()]
        birthday = partner.gp_birthday
        today = fields.Date.context_today(self)
        is_birthday = bool(birthday and (birthday.month, birthday.day) == (today.month, today.day))
        days_to_birthday = False
        if birthday:
            try:
                nxt = birthday.replace(year=today.year)
            except ValueError:  # 29 February
                nxt = date(today.year, 3, 1)
            if nxt < today:
                try:
                    nxt = birthday.replace(year=today.year + 1)
                except ValueError:
                    nxt = date(today.year + 1, 3, 1)
            days_to_birthday = (nxt - today).days
        return {
            'visits': visits,
            'spent': float(spent or 0.0),
            'last_visit': fields.Datetime.to_string(last) if last else False,
            'favorites': favorites,
            'is_birthday': is_birthday,
            'days_to_birthday': days_to_birthday,
        }

    @api.model
    def gp_recent_customers(self, config_id, limit=8):
        """Customers of the latest paid orders of this Point of Sale."""
        config = self.env['pos.config'].browse(config_id).exists()
        if not config:
            return []
        orders = self.env['pos.order'].search([
            ('config_id', '=', config.id), ('partner_id', '!=', False),
            ('state', 'in', ('paid', 'done')),
        ], order='date_order desc, id desc', limit=200)
        seen, result = set(), []
        for order in orders:
            if order.partner_id.id in seen:
                continue
            seen.add(order.partner_id.id)
            result.append({
                'id': order.partner_id.id,
                'name': order.partner_id.name,
                'total': order.amount_total,
                'date': fields.Datetime.to_string(order.date_order),
            })
            if len(result) >= limit:
                break
        return result
