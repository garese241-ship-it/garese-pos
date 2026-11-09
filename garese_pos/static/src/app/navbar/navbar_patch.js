import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { CashierName } from "@point_of_sale/app/components/navbar/cashier_name/cashier_name";
import { GpClock } from "@garese_pos/app/navbar/clock";

Navbar.components = { ...Navbar.components, GpClock };

patch(Navbar.prototype, {
    get gpLogoUrl() {
        const config = this.pos.config;
        return config.gp_logo
            ? `/web/image?model=pos.config&field=gp_logo&id=${config.id}&unique=${config.write_date}`
            : false;
    },
    get gpOnline() {
        return !this.pos.data.network.offline;
    },
});

patch(CashierName.prototype, {
    get gpName() {
        return this.pos.getCashier()?.name || "";
    },
    get gpRole() {
        return this.pos.getCashier()?._role === "manager" ? _t("Manager") : _t("Cashier");
    },
});
