/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { _t } from "@web/core/l10n/translation";
import { onMounted, useRef, useState } from "@odoo/owl";

/**
 * A manager picks his name and types his Odoo password on the register.
 * The password is checked by the server (standard login check), never here.
 */
export class GpManagerAuthPopup extends AbstractAwaitablePopup {
    static template = "garese_pos.GpManagerAuthPopup";
    static defaultProps = {
        confirmText: _t("Authorize"),
        cancelText: _t("Cancel"),
        body: "",
    };

    setup() {
        super.setup();
        this.pos = usePos();
        this.orm = useService("orm");
        this.passwordRef = useRef("password");
        this.state = useState({
            userId: this.props.managers.length === 1 ? this.props.managers[0].id : 0,
            password: "",
            error: "",
            busy: false,
        });
        onMounted(() => this.passwordRef.el?.focus());
    }
    get canConfirm() {
        return this.state.userId && this.state.password && !this.state.busy;
    }
    onKeydown(ev) {
        if (ev.key === "Enter" && this.canConfirm) {
            this.confirm();
        }
    }
    async confirm() {
        if (!this.canConfirm) {
            return;
        }
        this.state.busy = true;
        this.state.error = "";
        let result;
        try {
            // other modules may give their own server call (props.authorize)
            result = this.props.authorize
                ? await this.props.authorize(this.state.userId, this.state.password)
                : await this.orm.call("pos.session", "gp_manager_authorize", [
                      [this.pos.pos_session.id],
                      this.state.userId,
                      this.state.password,
                      this.props.purpose,
                  ]);
        } catch {
            result = { ok: false, message: _t("The server cannot be reached. Check the network.") };
        } finally {
            this.state.busy = false;
        }
        if (!result.ok) {
            this.state.error = result.message;
            this.state.password = "";
            this.passwordRef.el?.focus();
            return;
        }
        this._result = result;
        return super.confirm();
    }
    getPayload() {
        return this._result;
    }
}
