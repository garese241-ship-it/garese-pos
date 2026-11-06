/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { TextAreaPopup } from "@point_of_sale/app/utils/input_popups/textarea_popup";
import { gpOrderSummary, gpParseAmounts } from "@garese_pos/app/utils/order_summary";

// Default look of a payment method without its own image / icon / color.
const TYPE_ICONS = { cash: "fa-money", bank: "fa-credit-card", pay_later: "fa-user" };
const TYPE_COLORS = { cash: "green", bank: "blue", pay_later: "purple" };

patch(PaymentScreen.prototype, {
    // ------------------------------------------------------------------
    // Payment methods
    // ------------------------------------------------------------------
    gpMethodIcon(method) {
        return method.gp_icon || TYPE_ICONS[method.type] || "fa-credit-card";
    },
    gpMethodColor(method) {
        return method.gp_color || TYPE_COLORS[method.type] || "grey";
    },
    gpIsMethodSelected(method) {
        return this.selectedPaymentLine?.payment_method.id === method.id;
    },

    // ------------------------------------------------------------------
    // Transaction reference (mobile money, transfer, cheque...)
    // ------------------------------------------------------------------
    addNewPaymentLine(paymentMethod) {
        const added = super.addNewPaymentLine(...arguments);
        if (added && paymentMethod.gp_ask_reference && this.selectedPaymentLine) {
            // Not awaited: the standard method is synchronous and its callers
            // rely on its boolean result.
            this.gpAskReference(this.selectedPaymentLine, { removeOnCancel: true });
        }
        return added;
    },
    async gpAskReference(line, { removeOnCancel = false } = {}) {
        const { confirmed, payload } = await this.popup.add(TextInputPopup, {
            title: _t("Transaction reference - %s", line.payment_method.name),
            startingValue: line.transaction_id || "",
            placeholder: _t("Reference received from the operator or the bank"),
        });
        const reference = (payload || "").trim();
        if (confirmed && reference) {
            line.transaction_id = reference;
            return true;
        }
        // A payment that requires a reference cannot stay without one.
        if (removeOnCancel && !line.transaction_id && this.paymentLines.includes(line)) {
            this.deletePaymentLine(line.cid);
        }
        return false;
    },
    async _isOrderValid(isForceValidate) {
        const missing = this.paymentLines.find(
            (line) =>
                line.payment_method.gp_ask_reference &&
                !line.transaction_id &&
                !this.env.utils.floatIsZero(line.get_amount())
        );
        if (missing) {
            this.popup.add(ErrorPopup, {
                title: _t("Transaction reference missing"),
                body: _t(
                    "Enter the reference of the %s payment before validating.",
                    missing.payment_method.name
                ),
            });
            return false;
        }
        return super._isOrderValid(...arguments);
    },

    // ------------------------------------------------------------------
    // Amounts
    // ------------------------------------------------------------------
    gpFormat(amount) {
        return this.env.utils.formatCurrency(amount);
    },
    /** Order total, cash rounding included: what the customer owes. */
    get gpTotalToPay() {
        const order = this.currentOrder;
        return order.get_total_with_tax() + order.get_rounding_applied();
    },
    /**
     * What the big figure of the screen shows, depending on where the
     * payment stands: still due, change to give back, exact, or a refund.
     */
    get gpAmountState() {
        const order = this.currentOrder;
        const isZero = (value) => this.env.utils.floatIsZero(value);
        const due = order.get_due();
        const change = order.get_change();
        if (this.gpTotalToPay < 0 && !isZero(due)) {
            return { key: "refund", label: _t("Amount to refund"), amount: this.gpFormat(-due) };
        }
        if (due > 0 && !isZero(due)) {
            return { key: "due", label: _t("Amount to receive"), amount: this.gpFormat(due) };
        }
        if (change > 0 && !isZero(change)) {
            return {
                key: "change",
                label: _t("Change to give back"),
                amount: this.gpFormat(change),
            };
        }
        return {
            key: "paid",
            label: _t("Payment complete"),
            amount: this.gpFormat(order.get_total_paid()),
        };
    },
    get gpTotals() {
        const order = this.currentOrder;
        const due = order.get_due();
        const change = order.get_change();
        const hasChange = change > 0 && !this.env.utils.floatIsZero(change);
        return {
            total: this.gpFormat(this.gpTotalToPay),
            received: this.gpFormat(order.get_total_paid()),
            hasChange,
            change: this.gpFormat(change),
            remaining: this.gpFormat(Math.max(due, 0)),
            isSettled: !(due > 0) || this.env.utils.floatIsZero(due),
        };
    },

    // ------------------------------------------------------------------
    // One-tap amounts and numpad "+" keys
    // ------------------------------------------------------------------
    get gpQuickAmounts() {
        return gpParseAmounts(this.pos.config.gp_quick_amounts).map((value) => ({
            value,
            label: this.env.utils.formatCurrency(value, false),
        }));
    },
    getNumpadButtons() {
        const buttons = super.getNumpadButtons(...arguments);
        const increments = gpParseAmounts(this.pos.config.gp_numpad_increments);
        if (increments.length !== 3) {
            return buttons;
        }
        let index = 0;
        return buttons.map((button) => {
            if (!/^\+\d/.test(button.value) || index >= increments.length) {
                return button;
            }
            const increment = increments[index++];
            return {
                ...button,
                value: `+${increment}`,
                text: `+${this.env.utils.formatCurrency(increment, false)}`,
            };
        });
    },
    /**
     * The number buffer of Odoo only knows the keys "+10", "+20" and "+50":
     * the configured increments are applied here, with the same behaviour
     * (added to what is being typed; a first press replaces the amount).
     */
    gpOnNumpadClick(value) {
        const isCustomIncrement = /^\+\d/.test(value) && !["+10", "+20", "+50"].includes(value);
        if (!isCustomIncrement) {
            return this.numberBuffer.sendKey(value);
        }
        if (!this.gpEnsureSelectedLine()) {
            return;
        }
        const typed = this.numberBuffer.get() ? this.numberBuffer.getFloat() : 0;
        const total = (typed || 0) + Number(value.slice(1));
        this.numberBuffer.set(
            String(total).replace(".", this.env.services.localization.decimalPoint)
        );
        this.updateSelectedPaymentline();
    },
    /**
     * Amounts are typed on the selected payment line. When there is none yet,
     * start a cash payment (banknotes are cash), or the first method.
     */
    gpEnsureSelectedLine() {
        if (this.selectedPaymentLine) {
            return true;
        }
        const method =
            this.payment_methods_from_config.find((m) => m.type === "cash") ||
            this.payment_methods_from_config[0];
        return Boolean(method) && this.addNewPaymentLine(method);
    },
    /** The customer hands over `amount` (a banknote, typically). */
    gpSetQuickAmount(amount) {
        if (!this.gpEnsureSelectedLine()) {
            return;
        }
        this.numberBuffer.reset();
        this.updateSelectedPaymentline(amount);
    },
    /** Set the selected payment so that the order is exactly paid. */
    gpSetExactAmount() {
        const hadLine = Boolean(this.selectedPaymentLine);
        if (!this.gpEnsureSelectedLine() || !hadLine) {
            return; // a new line is created with the amount still due
        }
        const line = this.selectedPaymentLine;
        this.numberBuffer.reset();
        this.updateSelectedPaymentline(line.get_amount() + this.currentOrder.get_due());
    },

    // ------------------------------------------------------------------
    // Order recap (right column)
    // ------------------------------------------------------------------
    get gpRecapLines() {
        const showImages = this.pos.show_product_images;
        return this.currentOrder.get_orderlines().map((line) => {
            const data = line.getDisplayData();
            return {
                key: line.cid,
                name: data.productName,
                detail: `${data.gpQty} x ${data.unitPrice}`,
                total: data.price,
                isChild: Boolean(line.comboParent),
                imageUrl: (showImages && line.get_product().getImageUrl()) || false,
            };
        });
    },
    get gpItemCountLabel() {
        const count = this.currentOrder.get_orderlines().filter((line) => !line.comboParent)
            .length;
        return count === 1 ? _t("1 item") : _t("%s items", count);
    },
    get gpSummary() {
        return gpOrderSummary(this.currentOrder, this.env);
    },
    async gpEditNote() {
        const order = this.currentOrder;
        const { confirmed, payload } = await this.popup.add(TextAreaPopup, {
            title: _t("Customer Note"),
            startingValue: order.gp_note || "",
        });
        if (confirmed) {
            order.gp_note = (payload || "").trim();
        }
    },
});
