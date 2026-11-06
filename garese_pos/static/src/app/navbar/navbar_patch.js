/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { Navbar } from "@point_of_sale/app/navbar/navbar";
import { CashierName } from "@point_of_sale/app/navbar/cashier_name/cashier_name";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { Input } from "@point_of_sale/app/generic_components/inputs/input/input";
import { GpClock } from "@garese_pos/app/navbar/clock";

Navbar.components = { ...Navbar.components, Input, GpClock };

patch(Navbar.prototype, {
    /** The product search only makes sense on the product screen. */
    get gpShowSearch() {
        return !this.ui.isSmall && this.pos.mainScreen.component === ProductScreen;
    },
    get gpSearchPlaceholder() {
        return _t("Search a product (name, code, barcode)...");
    },
    /** [object, key] edited by the search field (overridden by other screens). */
    get gpSearchModel() {
        return [this.pos, "searchProductWord"];
    },
    /** Manual code entry only makes sense next to the product search. */
    get gpShowScan() {
        return this.pos.mainScreen.component === ProductScreen;
    },
});

patch(CashierName.prototype, {
    get gpRole() {
        return this.pos.get_cashier()?.role === "manager" ? _t("Manager") : _t("Cashier");
    },
});
