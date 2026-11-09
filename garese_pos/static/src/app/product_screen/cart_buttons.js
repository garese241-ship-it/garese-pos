import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";

/** Row of buttons under the cart title: refund, code, recent customers... */
export class GpCartButtons extends Component {
    static template = "garese_pos.GpCartButtons";
    static props = {};

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }
    get order() {
        return this.pos.getOrder();
    }
    get canRefund() {
        return this.pos.cashier?._role !== "minimal";
    }
    get showPricelist() {
        return (this.pos.config.availablePricelists || []).length > 1;
    }
    get hasPromoCodeButton() {
        // The Loyalty app brings its own "Enter Code" (coupons, promo codes).
        return Boolean(this.pos.config.module_pos_loyalty) && false;
    }
    clickRefund() {
        const order = this.order;
        const partner = order.getPartner();
        const searchDetails = partner ? { fieldName: "PARTNER", searchTerm: partner.name } : {};
        this.pos.navigate("TicketScreen", {
            stateOverride: { filter: "SYNCED", search: searchDetails, destinationOrder: order },
        });
    }
    async clickPricelist() {
        const order = this.order;
        const list = this.pos.config.availablePricelists.map((pricelist) => ({
            id: pricelist.id,
            label: pricelist.name,
            isSelected: order.pricelist_id && pricelist.id === order.pricelist_id.id,
            item: pricelist,
        }));
        if (!this.pos.config.pricelist_id) {
            list.push({ id: null, label: _t("Default Price"), isSelected: !order.pricelist_id, item: null });
        }
        const payload = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Select the pricelist"),
            list,
        });
        if (payload !== undefined) {
            this.pos.selectPricelist(payload);
        }
    }
}
