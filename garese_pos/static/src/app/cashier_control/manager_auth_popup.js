import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

/**
 * A manager picks his name and types his Odoo password on the register.
 * The password is checked by the server (standard login check), never here.
 * Reusable by other modules through the `authorize` prop.
 */
export class GpManagerAuthPopup extends Component {
    static template = "garese_pos.GpManagerAuthPopup";
    static components = { Dialog };
    static props = {
        title: String,
        body: { type: String, optional: true },
        managers: Array,
        purpose: { type: String, optional: true },
        authorize: { type: Function, optional: true },
        confirmText: { type: String, optional: true },
        getPayload: Function,
        close: Function,
    };
    static defaultProps = { body: "", purpose: "closing" };

    setup() {
        this.pos = usePos();
        this.passwordRef = useRef("password");
        this.state = useState({
            userId: this.props.managers.length === 1 ? this.props.managers[0].id : 0,
            password: "",
            error: "",
            busy: false,
        });
        onMounted(() => this.passwordRef.el?.focus());
    }
    get confirmText() {
        return this.props.confirmText || _t("Authorize");
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
            result = this.props.authorize
                ? await this.props.authorize(this.state.userId, this.state.password)
                : await this.pos.data.call("pos.session", "gp_manager_authorize", [
                      [this.pos.session.id],
                      this.state.userId,
                      this.state.password,
                      this.props.purpose,
                  ]);
        } catch {
            result = { ok: false, message: _t("The server cannot be reached. Check the network.") };
        } finally {
            this.state.busy = false;
        }
        if (!result?.ok) {
            this.state.error = result?.message || _t("Wrong password.");
            this.state.password = "";
            this.passwordRef.el?.focus();
            return;
        }
        this.props.getPayload(result);
        this.props.close();
    }
    cancel() {
        this.props.close();
    }
}
