/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Navbar } from "@point_of_sale/app/navbar/navbar";
import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { GpManagerAuthPopup } from "@garese_pos/app/cashier_control/manager_auth_popup";

const { DateTime } = luxon;

patch(PosStore.prototype, {
    /** Manager of this register (the role computed by the server). */
    get gpIsManager() {
        // the server decides with the Odoo user who is logged in, not with the
        // cashier picked on the register (pos_hr): use the same user here
        return (this.user || this.get_cashier())?.role === "manager";
    },
    /** The cashier has no back-office: no way out of the register. */
    get gpCashierOnly() {
        return Boolean(this.user?.gp_cashier_only) && !this.gpIsManager;
    },
    get gpAuthorized() {
        return this.gpIsManager || Boolean(this.gpAuthUntil && this.gpAuthUntil > DateTime.now());
    },
    /** Totals of the session are hidden from this user. */
    get gpHideTotals() {
        return Boolean(this.config.gp_hide_closing_totals) && !this.gpAuthorized;
    },
    /**
     * Ask a manager's password, unless the user is a manager or a manager
     * authorized a moment ago. Resolves to true when allowed.
     * The server keeps the authorization too: it checks it on every action.
     */
    async gpRequestManager(purpose, title, body = "") {
        if (this.gpAuthorized) {
            return true;
        }
        let managers = [];
        try {
            managers = await this.orm.call("pos.session", "gp_get_managers", [[this.pos_session.id]]);
        } catch {
            await this.popup.add(ErrorPopup, {
                title: _t("No connection"),
                body: _t("A manager's authorization needs the server. Check the network and try again."),
            });
            return false;
        }
        if (!managers.length) {
            await this.popup.add(ErrorPopup, {
                title: _t("No manager"),
                body: _t("No user is manager of this Point of Sale: nobody can authorize this action."),
            });
            return false;
        }
        const { confirmed, payload } = await this.popup.add(GpManagerAuthPopup, {
            title,
            body,
            managers,
            purpose,
        });
        if (!confirmed) {
            return false;
        }
        this.gpAuthUntil = DateTime.fromSQL(payload.until, { zone: "utc" });
        this.gpAuthBy = payload.name;
        return true;
    },
});

patch(Navbar.prototype, {
    async closeSession() {
        if (this.pos.config.gp_close_requires_manager) {
            const allowed = await this.pos.gpRequestManager(
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
