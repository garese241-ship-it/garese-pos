import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

/** Quick card of the customer of the order: spending, visits, favorites, reward. */
export class GpCustomerCard extends Component {
    static template = "garese_pos.GpCustomerCard";
    static props = { partner: Object };

    setup() {
        this.pos = usePos();
        this.state = useState({ card: null, open: false });
        onWillStart(() => this.load(this.props.partner.id));
        onWillUpdateProps((next) => {
            if (next.partner.id !== this.props.partner.id) {
                return this.load(next.partner.id);
            }
        });
    }

    async load(partnerId) {
        this.state.card = null;
        try {
            const card = await this.pos.data.silentCall("res.partner", "gp_customer_card", [
                partnerId,
                this.pos.config.id,
            ]);
            if (partnerId === this.props.partner.id || !this.state.card) {
                this.state.card = card && card.visits !== undefined ? card : null;
            }
        } catch {
            this.state.card = null; // offline: the card is simply not shown
        }
    }

    get config() {
        return this.pos.config;
    }
    get card() {
        return this.state.card;
    }
    get isVip() {
        const threshold = this.config.gp_vip_threshold;
        return threshold > 0 && this.card && this.card.spent >= threshold;
    }
    get spent() {
        return this.pos.gpFormat(this.card.spent);
    }
    get visitsLabel() {
        const visits = this.card.visits;
        if (!visits) {
            return _t("First purchase");
        }
        return visits === 1 ? _t("1 visit") : _t("%s visits", visits);
    }
    get lastVisitLabel() {
        if (!this.card.last_visit) {
            return "";
        }
        const days = Math.floor(
            (Date.now() - new Date(this.card.last_visit.replace(" ", "T") + "Z").getTime()) / 86400000
        );
        if (days <= 0) {
            return _t("today");
        }
        return days === 1 ? _t("yesterday") : _t("%s days ago", days);
    }
    get birthdayLabel() {
        const { is_birthday, days_to_birthday } = this.card;
        if (is_birthday) {
            return _t("Birthday today!");
        }
        if (days_to_birthday !== false && days_to_birthday <= 7) {
            return days_to_birthday === 1
                ? _t("Birthday tomorrow")
                : _t("Birthday in %s days", days_to_birthday);
        }
        return "";
    }
    /** Reward progress: purchases since the last reward, out of "every N". */
    get loyalty() {
        const every = this.config.gp_loyalty_every;
        if (!(every > 0)) {
            return false;
        }
        const visits = this.card.visits;
        const inCycle = visits % every;
        const ready = visits > 0 && inCycle === 0;
        const reward = this.config.gp_loyalty_reward || _t("a reward");
        const left = ready ? 0 : every - inCycle;
        return {
            ready,
            percent: ready ? 100 : Math.round((inCycle / every) * 100),
            text: ready
                ? _t("Reward available: %s", reward)
                : left === 1
                ? _t("1 more purchase for %s", reward)
                : _t("%(left)s more purchases for %(reward)s", { left, reward }),
        };
    }
    get favorites() {
        const templates = [];
        for (const id of this.card.favorites || []) {
            const template = this.pos.models["product.product"].get(id)?.product_tmpl_id;
            if (template && template.canBeDisplayed && !templates.includes(template)) {
                templates.push(template);
            }
        }
        return templates;
    }
    toggle() {
        this.state.open = !this.state.open;
    }
    addFavorite(template) {
        this.pos.addLineToCurrentOrder({ product_tmpl_id: template }, {});
    }
}
