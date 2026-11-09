import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { onMounted, useState } from "@odoo/owl";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { TextInputPopup } from "@point_of_sale/app/components/popups/text_input_popup/text_input_popup";
import {
    gpOrderAmounts,
    gpOrderAmountsTaxIncluded,
    gpTaxRateLabel,
} from "@garese_pos/app/utils/order_summary";

// ----------------------------------------------------------------------
// "Payment successful" screen
// ----------------------------------------------------------------------
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.gpState = useState({ sharing: false });
        onMounted(() => {
            this.pos.gpSound?.("success");
            if (this.pos.config.gp_daily_goal > 0) {
                setTimeout(() => this.pos.gpRefreshGoal(), 2500);
            }
        });
    },
    get gpLayout() {
        return !this.ui.isSmall;
    },
    get gpPaidAmount() {
        return this.orderAmountPlusTip;
    },
    get gpChange() {
        const change = Math.abs(this.currentOrder.change || 0);
        return change > 0.0001 ? this.env.utils.formatCurrency(change) : "";
    },
    async gpSendEmail() {
        const payload = await makeAwaitable(this.dialog, TextInputPopup, {
            title: _t("Send the receipt by email"),
            startingValue: this.state.email || "",
            placeholder: _t("Email address"),
        });
        if (payload === undefined) {
            return;
        }
        this.state.email = (payload || "").trim();
        if (!this.isValidEmail) {
            this.notification.add(_t("Invalid email."), { type: "warning" });
            return;
        }
        this.actionSendReceiptOnEmail();
    },
    async gpShare() {
        if (this.gpState.sharing) {
            return;
        }
        this.gpState.sharing = true;
        try {
            const jpeg = await this.renderer.toJpeg(
                OrderReceipt,
                { order: this.currentOrder },
                { addClass: "pos-receipt-print", addEmailMargins: true }
            );
            const bytes = Uint8Array.from(atob(jpeg), (char) => char.charCodeAt(0));
            const fileName = `${_t("Receipt")}-${this.currentOrder.pos_reference || this.currentOrder.uuid}.jpg`;
            const file = new File([bytes], fileName, { type: "image/jpeg" });
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: fileName });
            } else {
                const url = URL.createObjectURL(file);
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                this.notification.add(_t("Receipt saved as a picture."), { type: "info" });
            }
        } catch (error) {
            if (error?.name !== "AbortError") {
                this.notification.add(_t("The receipt could not be shared."), { type: "warning" });
            }
        } finally {
            this.gpState.sharing = false;
        }
    },
});

// ----------------------------------------------------------------------
// Sales receipt
// ----------------------------------------------------------------------
patch(OrderReceipt.prototype, {
    get gp() {
        const order = this.order;
        const config = order.config;
        const showTax = Boolean(config.gp_receipt_show_tax);
        const amounts = showTax ? gpOrderAmounts(order) : gpOrderAmountsTaxIncluded(order);
        return {
            number: order.pos_reference || order.tracking_number || "",
            date: order.date_order ? order.formatDateOrTime("date_order") : "",
            register: config.name,
            cashier: order.getCashierName?.() || "",
            partner: order.getPartner()?.name || "",
            note: order.gp_note || "",
            waiter: order.gp_waiter_id?.name || "",
            font: config.gp_receipt_font || "large",
            showTax,
            subtotal: amounts.subtotal,
            discount: amounts.discount,
            tax: amounts.tax,
            taxRate: gpTaxRateLabel(order),
            street: order.company?.street || "",
            cityLine: [order.company?.city, order.company?.country_id?.name].filter(Boolean).join(", "),
        };
    },
});

// Receipt lines: the cells of the 4-column receipt
patch(Orderline.prototype, {
    get gpReceipt() {
        if (this.props.mode !== "receipt") {
            return false;
        }
        const line = this.line;
        const format = (amount) => this.env.utils.formatCurrency(amount, false);
        const qty = line.qty;
        const template = line.product_id?.product_tmpl_id;
        const promo =
            line.price_type === "original" && !line.is_reward_line && line.order_id?.pricelist_id
                ? template?.gpPromoFor(line.order_id.pricelist_id)
                : false;
        return {
            qty: Number.isInteger(qty) ? String(qty) : line.quantityStr,
            unit: format(line.displayPriceUnit),
            total: format(line.displayPrice),
            promo: promo ? { percent: promo.percent, oldPrice: format(promo.oldPrice) } : false,
        };
    },
});
