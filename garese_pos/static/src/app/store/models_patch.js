/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { Order, Orderline, Payment } from "@point_of_sale/app/store/models";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import {
    gpOrderAmounts,
    gpOrderAmountsTaxIncluded,
    gpTaxRateLabel,
} from "@garese_pos/app/utils/order_summary";

// ----------------------------------------------------------------------
// Order: customer note typed on the payment screen, waiter, receipt data
// ----------------------------------------------------------------------
patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        // init_from_JSON (called by super for a restored order) may already
        // have set it.
        this.gp_note = this.gp_note || "";
        if (this.gp_waiter_id === undefined) {
            // new order
            this.gp_waiter_id = (this.pos.config.gp_use_waiter && this.gpDefaultWaiterId()) || false;
        }
    },
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.gp_note = json.gp_note || "";
        this.gp_waiter_id = json.gp_waiter_id || false;
    },
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.gp_note = this.gp_note || "";
        json.gp_waiter_id = this.gp_waiter_id || false;
        return json;
    },
    /** Waiter proposed on a new order (the restaurant floor plan gives the one of the table). */
    gpDefaultWaiterId() {
        return false;
    },
    gpSetWaiter(waiterId) {
        this.gp_waiter_id = waiterId || false;
    },
    get gpWaiterName() {
        return this.pos.gpWaiterName(this.gp_waiter_id);
    },
    /**
     * Lines of a preparation ticket (kitchen / bar printer). The standard
     * ticket is rendered from these lines only: each one carries the waiter
     * (so that the ticket can print who serves the order) and the text size
     * of the Point of Sale. Copies, so that the record of what was already
     * sent stays untouched.
     */
    _getPrintingCategoriesChanges(categories, currentOrderChange) {
        const changes = super._getPrintingCategoriesChanges(...arguments);
        const extra = {
            gp_waiter: this.gpWaiterName,
            gp_font: this.pos.config.gp_receipt_font || "large",
        };
        return {
            ...changes,
            new: changes.new.map((change) => ({ ...change, ...extra })),
            cancelled: changes.cancelled.map((change) => ({ ...change, ...extra })),
        };
    },
    /** Setting "Waiter required": ask for it before going to the payment. */
    async pay() {
        const config = this.pos.config;
        if (config.gp_waiter_required && this.pos.gpUseWaiter && !this.gp_waiter_id && this.canPay()) {
            const chosen = await this.pos.gpSelectWaiter(this, { allowNone: false });
            if (!chosen || !this.gp_waiter_id) {
                return;
            }
        }
        return super.pay(...arguments);
    },
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        // Without the tax line, the receipt only shows tax-included amounts.
        const showTax = Boolean(this.pos.config.gp_receipt_show_tax);
        const amounts = showTax ? gpOrderAmounts(this) : gpOrderAmountsTaxIncluded(this);
        result.gp = {
            number: this.uid,
            register: this.pos.config.name,
            partner: this.get_partner()?.name || "",
            note: this.gp_note || "",
            waiter: this.gpWaiterName,
            font: this.pos.config.gp_receipt_font || "large",
            showTax,
            subtotal: amounts.subtotal,
            discount: amounts.discount,
            tax: amounts.tax,
            taxRate: gpTaxRateLabel(this),
        };
        return result;
    },
});

// ----------------------------------------------------------------------
// Order line: figures of the 4-column receipt (Qty / Description / Unit / Total)
// ----------------------------------------------------------------------
patch(Orderline.prototype, {
    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        const quantity = this.get_quantity();
        const format = (amount) => this.env.utils.formatCurrency(amount, false);
        // "2" rather than "2,00"; weighed products keep their decimals.
        data.gpQty = Number.isInteger(quantity) ? String(quantity) : this.get_quantity_str();
        data.gpUnitPrice = format(this.get_unit_display_price());
        // Same special cases as the standard `price` ("Free", combo parent).
        const isPlainPrice = this.get_discount_str() !== "100" && !this.comboLines?.length;
        data.gpPrice = isPlainPrice ? format(this.get_display_price()) : data.price;
        return data;
    },
});

// ----------------------------------------------------------------------
// Payment: reference typed by the cashier (mobile money, cheque...)
// ----------------------------------------------------------------------
patch(Payment.prototype, {
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        // `transaction_id` is also written by payment terminals: only print
        // it for the methods configured to ask the cashier for a reference.
        result.gp_reference =
            (this.payment_method?.gp_ask_reference && this.transaction_id) || "";
        return result;
    },
});

// ----------------------------------------------------------------------
// Receipt header: address of the company
// ----------------------------------------------------------------------
patch(PosStore.prototype, {
    getReceiptHeaderData() {
        const data = super.getReceiptHeaderData(...arguments);
        const { street, city, country_id } = this.company;
        const cityLine = [city, country_id?.[1]].filter(Boolean).join(", ");
        data.gp = { street: street || "", cityLine };
        return data;
    },
});
