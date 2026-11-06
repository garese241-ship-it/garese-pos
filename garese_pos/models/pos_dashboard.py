from datetime import datetime, time, timedelta

import pytz

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

PAID_STATES = ('paid', 'done', 'invoiced')
# Actions the dashboard may open, with the register as the default filter.
ALLOWED_ACTIONS = (
    'point_of_sale.action_pos_order_filtered',
    'point_of_sale.action_pos_session_filtered',
    'point_of_sale.action_report_pos_order_all_filtered',
)
PERIODS = ('today', 'yesterday', '7d', '30d')


class GaresePosDashboard(models.AbstractModel):
    _name = 'garese.pos.dashboard'
    _description = 'GARESE POS Dashboard'

    # ------------------------------------------------------------------
    # Periods (in the user's time zone, stored dates are UTC)
    # ------------------------------------------------------------------
    def _gp_tz(self):
        return pytz.timezone(self.env.context.get('tz') or self.env.user.tz or 'UTC')

    def _gp_periods(self, period):
        tz = self._gp_tz()
        now = pytz.utc.localize(fields.Datetime.now()).astimezone(tz)

        def midnight(day):
            return tz.localize(datetime.combine(day, time.min))

        def utc(value):
            return value.astimezone(pytz.utc).replace(tzinfo=None)

        today = now.date()
        if period == 'yesterday':
            start, end = midnight(today - timedelta(days=1)), midnight(today)
            prev_start = midnight(today - timedelta(days=2))
            prev_end = start
            chart_prev_end = prev_end
        elif period in ('7d', '30d'):
            days = 7 if period == '7d' else 30
            start, end = midnight(today - timedelta(days=days - 1)), now
            prev_start, prev_end = midnight(today - timedelta(days=2 * days - 1)), start
            chart_prev_end = prev_end
        else:
            period = 'today'
            start, end = midnight(today), now
            prev_start = midnight(today - timedelta(days=1))
            # same elapsed time as today for the totals, the whole day for the curve
            prev_end = prev_start + (now - start)
            chart_prev_end = start
        return {
            'period': period,
            'hourly': period in ('today', 'yesterday'),
            'tz': tz,
            'now': now,
            'start': utc(start), 'end': utc(end),
            'prev_start': utc(prev_start), 'prev_end': utc(prev_end),
            'chart_prev_end': utc(chart_prev_end),
            'days': (midnight(today).date() - start.date()).days + 1 if period in ('7d', '30d') else 1,
        }

    def _gp_local(self, value, tz):
        return pytz.utc.localize(value).astimezone(tz)

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------
    @api.model
    def get_data(self, config_id=False, period='today'):
        """Everything the dashboard shows, in a single call."""
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("You need to be a Point of Sale user to open the dashboard."))
        period = period if period in PERIODS else 'today'
        config_id = int(config_id) if config_id else False
        configs = self.env['pos.config'].search([])
        if config_id and config_id not in configs.ids:
            config_id = False
        is_manager = self.env.user.has_group('point_of_sale.group_pos_manager')
        currency = self.env.company.currency_id
        data = {
            'is_manager': is_manager,
            'currency_id': currency.id,
            'configs': [{'id': c.id, 'name': c.name} for c in configs],
            'config_id': config_id,
            'period': period,
        }
        shown = configs.filtered(lambda c: not config_id or c.id == config_id)
        data['registers'] = self._gp_registers(shown, is_manager)
        if is_manager:
            data.update(self._gp_statistics(config_id, period, configs, currency))
        return data

    @api.model
    def get_action(self, xmlid, config_id):
        if xmlid not in ALLOWED_ACTIONS:
            raise AccessError(_("This action is not available from the dashboard."))
        action = self.env['ir.actions.act_window']._for_xml_id(xmlid)
        action['context'] = {
            'search_default_config_id': [int(config_id)],
            'default_config_id': int(config_id),
        }
        return action

    # ------------------------------------------------------------------
    # Registers: what the standard dashboard cards show
    # ------------------------------------------------------------------
    def _gp_registers(self, configs, with_sales):
        sales = {}
        if with_sales and configs:
            today = self._gp_periods('today')
            for config, total in self.env['pos.order']._read_group(
                    [('state', 'in', PAID_STATES), ('config_id', 'in', configs.ids),
                     ('date_order', '>=', today['start']), ('date_order', '<=', today['end'])],
                    ['config_id'], ['amount_total:sum']):
                sales[config.id] = total
        result = []
        for config in configs:
            user = config.current_user_id
            result.append({
                'id': config.id,
                'name': config.name,
                'cash_control': config.cash_control,
                'current_session_id': config.current_session_id.id,
                'current_session_state': config.current_session_state,
                'pos_session_state': config.pos_session_state,
                'pos_session_username': config.pos_session_username,
                'pos_session_duration': float(config.pos_session_duration or 0),
                'last_session_closing_date': fields.Date.to_string(config.last_session_closing_date)
                if config.last_session_closing_date else False,
                'last_session_closing_cash': config.last_session_closing_cash,
                'number_of_rescue_session': config.number_of_rescue_session,
                'user_id': user.id,
                'user_name': user.name,
                'sales_today': sales.get(config.id, 0.0),
            })
        return result

    # ------------------------------------------------------------------
    # Statistics (managers only: they show the turnover)
    # ------------------------------------------------------------------
    def _gp_statistics(self, config_id, period, all_configs, currency):
        p = self._gp_periods(period)
        tz = p['tz']
        Order = self.env['pos.order']
        has_guests = 'customer_count' in Order._fields
        order_fields = ['date_order', 'amount_total', 'partner_id']
        if has_guests:
            order_fields.append('customer_count')
        domain = [('state', 'in', PAID_STATES)]
        if config_id:
            domain.append(('config_id', '=', config_id))
        rows = Order.search_read(
            domain + [('date_order', '>=', p['prev_start']), ('date_order', '<=', p['end'])],
            order_fields, order='date_order')

        def kpis(selected):
            turnover = sum(r['amount_total'] for r in selected)
            tickets = [r for r in selected if r['amount_total'] >= 0]
            clients = 0
            for r in tickets:
                clients += (r.get('customer_count') or 0) or 1
            return {
                'turnover': turnover,
                'tickets': len(tickets),
                'average': turnover / len(tickets) if tickets else 0.0,
                'clients': clients,
            }

        current = [r for r in rows if p['start'] <= r['date_order'] <= p['end']]
        previous = [r for r in rows if p['prev_start'] <= r['date_order'] < p['prev_end']]

        # Curve: one point per hour (one day) or per day (several days).
        if p['hourly']:
            size = 24
            index = lambda value, origin: self._gp_local(value, tz).hour  # noqa: E731
            labels = ['%02d:00' % h for h in range(24)]
            limit = p['now'].hour + 1 if period == 'today' else 24
        else:
            size = p['days']
            index = lambda value, origin: (self._gp_local(value, tz).date() - origin).days  # noqa: E731
            origin_cur = self._gp_local(p['start'], tz).date()
            labels = [(origin_cur + timedelta(days=i)).strftime('%d/%m') for i in range(size)]
            limit = size
        origin_prev = self._gp_local(p['prev_start'], tz).date()
        origin_cur = self._gp_local(p['start'], tz).date()
        cur_series, prev_series = [0.0] * size, [0.0] * size
        for r in rows:
            if p['start'] <= r['date_order'] <= p['end']:
                i = index(r['date_order'], origin_cur)
                if 0 <= i < size:
                    cur_series[i] += r['amount_total']
            elif p['prev_start'] <= r['date_order'] < p['chart_prev_end']:
                i = index(r['date_order'], origin_prev)
                if 0 <= i < size:
                    prev_series[i] += r['amount_total']

        result = {
            'kpis': {'current': kpis(current), 'previous': kpis(previous)},
            'chart': {
                'labels': labels,
                'current': cur_series[:limit],
                'previous': prev_series,
                'cumulative': p['hourly'],
            },
            'now': fields.Datetime.to_string(fields.Datetime.now()),
        }

        order_scope = [('order_id.state', 'in', PAID_STATES),
                       ('order_id.date_order', '>=', p['start']), ('order_id.date_order', '<=', p['end'])]
        if config_id:
            order_scope.append(('order_id.config_id', '=', config_id))
        result.update(self._gp_products(order_scope))
        result['payments'] = self._gp_payments(config_id, p)
        result['by_register'] = self._gp_by_register(all_configs, p)
        result['transactions'] = self._gp_transactions(config_id, tz)
        result['activity'] = self._gp_activity(config_id, tz)
        return result

    def _gp_products(self, order_scope):
        lines = self.env['pos.order.line']._read_group(
            order_scope, ['product_id'], ['qty:sum', 'price_subtotal_incl:sum'])
        categories, items = {}, []
        for product, qty, amount in lines:
            if not product:
                continue
            product = product.with_context(display_default_code=False)
            category = product.pos_categ_ids[:1]
            name = category.name if category else _("Other products")
            categories[name] = categories.get(name, 0.0) + amount
            items.append({'id': product.id, 'name': product.display_name, 'qty': qty, 'amount': amount})
        total = sum(v for v in categories.values() if v > 0) or 1.0
        ranked = sorted(categories.items(), key=lambda kv: kv[1], reverse=True)
        top = ranked[:5]
        rest = sum(v for _k, v in ranked[5:])
        if rest:
            top.append((_("Other products"), rest))
        merged = {}
        for name, amount in top:
            merged[name] = merged.get(name, 0.0) + amount
        cats = [{'name': n, 'amount': a, 'share': round(100.0 * a / total, 1)}
                for n, a in sorted(merged.items(), key=lambda kv: kv[1], reverse=True)]
        items = [i for i in items if i['qty'] > 0]
        items.sort(key=lambda i: (i['qty'], i['amount']), reverse=True)
        return {'categories': cats, 'top_products': items[:5]}

    def _gp_payments(self, config_id, p):
        domain = [('pos_order_id.state', 'in', PAID_STATES),
                  ('pos_order_id.date_order', '>=', p['start']),
                  ('pos_order_id.date_order', '<=', p['end'])]
        if config_id:
            domain.append(('pos_order_id.config_id', '=', config_id))
        has_color = 'gp_color' in self.env['pos.payment.method']._fields
        out = []
        for method, amount in self.env['pos.payment']._read_group(
                domain, ['payment_method_id'], ['amount:sum']):
            if amount:
                out.append({'name': method.name, 'amount': amount,
                            'color': method.gp_color if has_color else False})
        out.sort(key=lambda r: r['amount'], reverse=True)
        total = sum(r['amount'] for r in out if r['amount'] > 0) or 1.0
        main, rest = out[:5], out[5:]
        if rest:
            main.append({'name': _("Other methods"), 'amount': sum(r['amount'] for r in rest), 'color': 'grey'})
        for r in main:
            r['share'] = round(100.0 * r['amount'] / total, 1)
        return main

    def _gp_by_register(self, configs, p):
        totals = {}
        for config, amount in self.env['pos.order']._read_group(
                [('state', 'in', PAID_STATES), ('config_id', 'in', configs.ids),
                 ('date_order', '>=', p['start']), ('date_order', '<=', p['end'])],
                ['config_id'], ['amount_total:sum']):
            totals[config.id] = amount
        total = sum(v for v in totals.values() if v > 0) or 1.0
        rows = [{'id': c.id, 'name': c.name, 'amount': totals.get(c.id, 0.0),
                 'share': round(100.0 * totals.get(c.id, 0.0) / total, 1)} for c in configs]
        rows.sort(key=lambda r: r['amount'], reverse=True)
        return rows

    def _gp_payment_names(self, order):
        names = []
        for payment in order.payment_ids:
            if payment.amount > 0 and payment.payment_method_id.name not in names:
                names.append(payment.payment_method_id.name)
        return names

    def _gp_transactions(self, config_id, tz):
        domain = [('state', 'in', PAID_STATES)]
        if config_id:
            domain.append(('config_id', '=', config_id))
        orders = self.env['pos.order'].search(domain, order='date_order desc, id desc', limit=8)
        quantities = {}
        for order, qty in self.env['pos.order.line']._read_group(
                [('order_id', 'in', orders.ids)], ['order_id'], ['qty:sum']):
            quantities[order.id] = qty
        labels = {'paid': _("Validated"), 'done': _("Posted"), 'invoiced': _("Invoiced")}
        result = []
        for order in orders:
            local = self._gp_local(order.date_order, tz)
            refund = order.amount_total < 0
            result.append({
                'id': order.id,
                'time': local.strftime('%H:%M'),
                'date': local.strftime('%d/%m'),
                'reference': order.pos_reference or order.name,
                'partner': order.partner_id.name or _("Walk-in customer"),
                'articles': abs(quantities.get(order.id, 0.0)),
                'amount': order.amount_total,
                'payments': self._gp_payment_names(order),
                'register': order.config_id.name,
                'status': 'refund' if refund else order.state,
                'status_label': _("Refunded") if refund else labels.get(order.state, order.state),
            })
        return result

    def _gp_activity(self, config_id, tz):
        events = []
        cfg = [('config_id', '=', config_id)] if config_id else []
        orders = self.env['pos.order'].search(
            [('state', 'in', PAID_STATES)] + cfg, order='date_order desc, id desc', limit=10)
        for order in orders:
            events.append({
                'at': order.date_order, 'type': 'refund' if order.amount_total < 0 else 'sale',
                'amount': abs(order.amount_total), 'payments': self._gp_payment_names(order),
                'register': order.config_id.name,
            })
        Session = self.env['pos.session']
        for session in Session.search(cfg + [('start_at', '!=', False)], order='start_at desc', limit=5):
            events.append({'at': session.start_at, 'type': 'open', 'register': session.config_id.name,
                           'user': session.user_id.name})
        for session in Session.search(cfg + [('stop_at', '!=', False)], order='stop_at desc', limit=5):
            events.append({'at': session.stop_at, 'type': 'close', 'register': session.config_id.name,
                           'user': session.user_id.name})
        events.sort(key=lambda e: e['at'], reverse=True)
        result = []
        for event in events[:10]:
            local = self._gp_local(event['at'], tz)
            event['time'] = local.strftime('%H:%M')
            event['date'] = local.strftime('%d/%m')
            event['at'] = fields.Datetime.to_string(event['at'])
            result.append(event)
        return result
