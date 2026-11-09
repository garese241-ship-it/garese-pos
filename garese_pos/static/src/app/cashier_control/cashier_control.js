import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { GpManagerAuthPopup } from "@garese_pos/app/cashier_control/manager_auth_popup";

const { DateTime } = luxon;

patch(PosStore.prototype, {
    /** The connected Odoo user decides, as on the server (not the employee). */
    get gpIsManager() {
        return (this.user || this.getCashier())?._role === "manager";
    },
    get gpCashierOnly() {
        return Boolean(this.user?.gp_pos_cashier_only) && !this.gpIsManager;
    },
    get gpAuthorized() {
        return this.gpIsManager || Boolean(this.gpAuthUntil && this.gpAuthUntil > DateTime.now());
    },
    get gpHideTotals() {
        return Boolean(this.config.gp_hide_closing_totals) && !this.gpAuthorized;
    },
    async gpRequestManager(purpose, title, body = "") {
        if (this.gpAuthorized) {
            return true;
        }
        let managers = [];
        try {
            managers = await this.data.call("pos.session", "gp_get_managers", [[this.session.id]]);
        } catch {
            this.dialog.add(AlertDialog, {
                title: _t("No connection"),
                body: _t("A manager's authorization needs the server. Check the network and try again."),
            });
            return false;
        }
        if (!managers?.length) {
            this.dialog.add(AlertDialog, {
                title: _t("No manager"),
                body: _t("No user is manager of this Point of Sale: nobody can authorize this action."),
            });
            return false;
        }
        const payload = await makeAwaitable(this.dialog, GpManagerAuthPopup, {
            title,
            body,
            managers,
            purpose,
        });
        if (!payload) {
            return false;
        }
        this.gpAuthUntil = DateTime.fromSQL(payload.until, { zone: "utc" });
        this.gpAuthBy = payload.name;
        return true;
    },
    async closeSession() {
        if (this.config.gp_close_requires_manager) {
            const allowed = await this.gpRequestManager(
                "closing",
                _t("Closing authorized by a manager"),
                _t("A manager must type his password to close the session.")
            );
            if (!allowed) {
                return;
            }
        }
        return super.closeSession(...arguments);
    },
});

ClosePosPopup.props = [...ClosePosPopup.props, "gp_show_totals?"];
