/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { htmlToCanvas } from "@point_of_sale/app/printer/render_service";
import { loadAllImages } from "@point_of_sale/utils";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.popup = useService("popup");
        this.gpNotification = useService("pos_notification");
        this.gpState = useState({ printing: false, sending: false, sharing: false });
    },

    get gpPaidAmount() {
        return this.env.utils.formatCurrency(this.currentOrder.get_total_with_tax());
    },

    async gpPrint() {
        if (this.gpState.printing) {
            return;
        }
        this.gpState.printing = true;
        try {
            await this.printReceipt();
        } finally {
            this.gpState.printing = false;
        }
    },

    /** Ask for the address (pre-filled with the customer's) then send. */
    async gpSendEmail() {
        if (this.gpState.sending) {
            return;
        }
        const { confirmed, payload } = await this.popup.add(TextInputPopup, {
            title: _t("Send the receipt by email"),
            startingValue: this.orderUiState.inputEmail || "",
            placeholder: _t("Email address"),
        });
        if (!confirmed) {
            return;
        }
        this.orderUiState.inputEmail = (payload || "").trim();
        if (!this.isValidEmail()) {
            this.orderUiState.emailSuccessful = false;
            this.orderUiState.emailNotice = _t("Invalid email.");
            return;
        }
        this.gpState.sending = true;
        this.orderUiState.emailNotice = "";
        try {
            await this._sendReceiptToCustomer();
            this.orderUiState.emailSuccessful = true;
            this.orderUiState.emailNotice = _t("Email sent.");
        } catch {
            this.orderUiState.emailSuccessful = false;
            this.orderUiState.emailNotice = _t("Sending email failed. Please try again.");
        } finally {
            this.gpState.sending = false;
        }
    },

    /**
     * Share the receipt as a picture through the share sheet of the device
     * (WhatsApp, Bluetooth, email...). Browsers only expose it on secure
     * pages (https): otherwise the picture is downloaded instead.
     */
    async gpShare() {
        if (this.gpState.sharing) {
            return;
        }
        this.gpState.sharing = true;
        try {
            const el = await this.renderer.toHtml(OrderReceipt, {
                data: this.pos.get_order().export_for_printing(),
                formatCurrency: this.env.utils.formatCurrency,
            });
            try {
                await loadAllImages(el); // the logo must be there before the snapshot
            } catch {
                // a missing logo must not prevent sharing
            }
            const canvas = await htmlToCanvas(el, {
                addClass: "pos-receipt-print",
                addEmailMargins: true,
            });
            const jpeg = canvas.toDataURL("image/jpeg").replace("data:image/jpeg;base64,", "");
            const bytes = Uint8Array.from(atob(jpeg), (char) => char.charCodeAt(0));
            const label = _t("Receipt");
            const fileName = `${label}-${this.currentOrder.uid}.jpg`;
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
                this.gpNotification.add(_t("Receipt saved as a picture."), 3000);
            }
        } catch (error) {
            // The cashier closing the share sheet is not an error.
            if (error?.name !== "AbortError") {
                this.gpNotification.add(_t("The receipt could not be shared."), 3000);
            }
        } finally {
            this.gpState.sharing = false;
        }
    },
});
