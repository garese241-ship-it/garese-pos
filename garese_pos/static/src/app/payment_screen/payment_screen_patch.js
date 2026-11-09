import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { TextInputPopup } from "@point_of_sale/app/components/popups/text_input_popup/text_input_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";
import { gpOrderSummary, gpParseAmounts } from "@garese_pos/app/utils/order_summary";

const TYPE_ICONS = { cash: "fa-money", bank: "fa-credit-card", pay_later: "fa-user" };
const TYPE_COLORS = { cash: "green", bank: "blue", pay_later: "purple" };

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        if (!this.ui.isSmall) {
            this.payment_methods_from_config.slice(0, 9).forEach((method, index) => {
                useHotkey(`alt+${index + 1}`, () => this.addNewPaymentLine(method), {
                    bypassEditableProtection: true,
                });
            });
        }
    },
    get gpLayout() {
        return !this.ui.isSmall;
    },
    gpFormat(amount) {
        return this.env.utils.formatCurrency(amount || 0);
    },
    gpIsZero(value) {
        return this.currentOrder.currency.isZero(value);
    },

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
        return this.selectedPaymentLine?.payment_method_id?.id === method.id;
    },
    gpShowMethod(method) {
        return !(this.pos.cashier._role === "minimal" && method.type === "pay_later");
    },
    async addNewPaymentLine(paymentMethod) {
        const added = await super.addNewPaymentLine(...arguments);
        if (added && paymentMethod.gp_ask_reference && this.selectedPaymentLine) {
            await this.gpAskReference(this.selectedPaymentLine, { removeOnCancel: true });
        }
        return added;
    },
    async gpAskReference(line, { removeOnCancel = false } = {}) {
        const payload = await makeAwaitable(this.dialog, TextInputPopup, {
            title: _t("Transaction reference - %s", line.payment_method_id.name),
            startingValue: line.transaction_id || "",
            placeholder: _t("Reference received from the operator or the bank"),
        });
        const reference = (payload || "").trim();
        if (reference) {
            line.transaction_id = reference;
            return true;
        }
        if (removeOnCancel && !line.transaction_id && this.paymentLines.includes(line)) {
            this.deletePaymentLine(line.uuid);
        }
        return false;
    },

    // ------------------------------------------------------------------
    // Amounts
    // ------------------------------------------------------------------
    /** Change to give back (Odoo 19 signs it like the order). */
    get gpChange() {
        const order = this.currentOrder;
        if (!this.gpIsZero(order.remainingDue)) {
            return 0;
        }
        return Math.abs(order.change || 0);
    },
    get gpTotalToPay() {
        return this.currentOrder.totalDue;
    },
    get gpAmountState() {
        const order = this.currentOrder;
        const due = order.remainingDue;
        const change = this.gpChange;
        if (this.gpTotalToPay < 0 && !this.gpIsZero(due)) {
            return { key: "refund", label: _t("Amount to refund"), amount: this.gpFormat(-due) };
        }
        if (due > 0 && !this.gpIsZero(due)) {
            return { key: "due", label: _t("Amount to receive"), amount: this.gpFormat(due) };
        }
        if (change > 0 && !this.gpIsZero(change)) {
            return { key: "change", label: _t("Change to give back"), amount: this.gpFormat(change) };
        }
        return { key: "paid", label: _t("Payment complete"), amount: this.gpFormat(order.amountPaid) };
    },
    get gpTotals() {
        const order = this.currentOrder;
        const due = order.remainingDue;
        const change = this.gpChange;
        const hasChange = change > 0 && !this.gpIsZero(change);
        return {
            total: this.gpFormat(this.gpTotalToPay),
            received: this.gpFormat(order.amountPaid),
            hasChange,
            change: this.gpFormat(change),
            remaining: this.gpFormat(Math.max(due, 0)),
            isSettled: !(due > 0) || this.gpIsZero(due),
        };
    },
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
        // "+N" keys are handled by the number buffer whatever N is.
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
    async gpEnsureSelectedLine() {
        if (this.selectedPaymentLine) {
            return true;
        }
        const methods = this.payment_methods_from_config;
        const method = methods.find((m) => m.type === "cash") || methods[0];
        return Boolean(method) && (await this.addNewPaymentLine(method));
    },
    async gpSetQuickAmount(amount) {
        if (!(await this.gpEnsureSelectedLine())) {
            return;
        }
        this.numberBuffer.reset();
        this.updateSelectedPaymentline(amount);
    },
    async gpSetExactAmount() {
        const hadLine = Boolean(this.selectedPaymentLine);
        if (!(await this.gpEnsureSelectedLine()) || !hadLine) {
            return; // a new line is created with the amount still due
        }
        const line = this.selectedPaymentLine;
        this.numberBuffer.reset();
        this.updateSelectedPaymentline(line.getAmount() + this.currentOrder.remainingDue);
    },

    // ------------------------------------------------------------------
    // Order recap
    // ------------------------------------------------------------------
    get gpRecapLines() {
        const showImages = this.pos.config.show_product_images;
        return this.currentOrder.lines.map((line) => {
            const qty = line.qty;
            const qtyLabel = Number.isInteger(qty) ? String(qty) : line.quantityStr;
            const template = line.product_id?.product_tmpl_id;
            return {
                key: line.uuid,
                name: line.orderDisplayProductName?.name || line.getFullProductName(),
                detail: `${qtyLabel} × ${this.gpFormat(line.displayPriceUnit)}`,
                total: this.gpFormat(line.displayPrice),
                isChild: Boolean(line.combo_parent_id),
                imageUrl: (showImages && template?.image_128 && template.getImageUrl()) || false,
            };
        });
    },
    get gpItemCountLabel() {
        const count = this.currentOrder.lines.filter((line) => !line.combo_parent_id).length;
        return count === 1 ? _t("1 item") : _t("%s items", count);
    },
    get gpSummary() {
        return gpOrderSummary(this.currentOrder, this.env);
    },
    async gpEditNote() {
        const order = this.currentOrder;
        const payload = await makeAwaitable(this.dialog, TextInputPopup, {
            title: _t("Customer Note"),
            startingValue: order.gp_note || "",
            rows: 4,
        });
        if (payload !== undefined) {
            order.gp_note = (payload || "").trim();
        }
    },
});

// Reference required by the payment method: checked before validating.
patch(OrderPaymentValidation.prototype, {
    async isOrderValid(isForceValidate) {
        const missing = (this.paymentLines || []).find(
            (line) =>
                line.payment_method_id?.gp_ask_reference &&
                !line.transaction_id &&
                !this.order.currency.isZero(line.getAmount())
        );
        if (missing) {
            this.pos.dialog.add(AlertDialog, {
                title: _t("Transaction reference missing"),
                body: _t(
                    "Enter the reference of the %s payment before validating.",
                    missing.payment_method_id.name
                ),
            });
            return false;
        }
        return super.isOrderValid(...arguments);
    },
});
