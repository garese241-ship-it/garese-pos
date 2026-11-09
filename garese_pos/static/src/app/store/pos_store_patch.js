import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";
import { TextInputPopup } from "@point_of_sale/app/components/popups/text_input_popup/text_input_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { gpCtx } from "@garese_pos/app/utils/gp_context";

const GP_VIEW_MODE_KEY = "garese_pos.viewMode";
const GP_CALCULATOR_KEY = "garese_pos.calculator";
const GP_PAGE_SIZE = 60;
const GP_THEMES = ["violet", "green", "blue", "orange", "rose"];
const GP_TILES = ["compact", "normal", "large"];

function readLocalStorage(key, fallback) {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function writeLocalStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Private browsing / storage disabled: the preference is just not kept.
    }
}

patch(PosStore.prototype, {
    async setup() {
        // UI state of the GARESE product screen, declared before the data is
        // loaded so that every screen can rely on it.
        this.gpHome = true; // "Home" tile: promotions and best sellers first
        this.gpFilter = "all"; // all | favorite | promo | stock
        this.gpSort = "default"; // default | name | price_asc | price_desc | stock
        this.gpViewMode = readLocalStorage(GP_VIEW_MODE_KEY, "grid"); // grid | list
        this.gpShowCalculator = readLocalStorage(GP_CALCULATOR_KEY, "1") === "1";
        this.gpLimit = GP_PAGE_SIZE;
        this.gpStockTimer = null;
        this.gpGoalTimer = null;
        this.gpAffinity = {}; // product.product id -> [product.product ids]
        this.gpTodaySales = 0;
        this.gpGoalReached = false;
        gpCtx.pos = this;
        await super.setup(...arguments);
    },

    async afterProcessServerData() {
        const res = await super.afterProcessServerData(...arguments);
        this.gpApplyBodyClasses();
        // A start category configured on the Point of Sale wins over "Home".
        this.gpHome = !this.selectedCategory?.id;
        const minutes = this.config.gp_stock_refresh_minutes;
        if (this.config.gp_show_stock && minutes > 0 && !this.gpStockTimer) {
            this.gpStockTimer = setInterval(() => this.gpRefreshStock(), minutes * 60 * 1000);
        }
        if (this.config.gp_suggestions) {
            this.gpLoadAffinity();
        }
        if (this.config.gp_daily_goal > 0) {
            this.gpRefreshGoal(false);
            if (!this.gpGoalTimer) {
                this.gpGoalTimer = setInterval(() => this.gpRefreshGoal(), 2 * 60 * 1000);
            }
        }
        return res;
    },

    /** Screen ambiance, color theme and tile size are CSS classes on <body>. */
    gpApplyBodyClasses() {
        const body = document.body;
        body.classList.remove("gp-amb-bright", "gp-amb-soft", "gp-amb-dim");
        body.classList.add(`gp-amb-${this.config.gp_ambiance || "soft"}`);
        GP_THEMES.forEach((name) => body.classList.remove(`gp-theme-${name}`));
        GP_TILES.forEach((name) => body.classList.remove(`gp-tiles-${name}`));
        body.classList.add(`gp-theme-${this.config.gp_theme || "violet"}`);
        body.classList.add(`gp-tiles-${this.config.gp_tile_size || "normal"}`);
        body.classList.add("gp-pos");
    },

    gpFormat(amount) {
        return this.env.utils.formatCurrency(amount || 0);
    },
    gpNotify(message, type = "info") {
        this.notification.add(message, { type, sticky: false });
    },

    // ------------------------------------------------------------------
    // Navigation between Home / All / categories
    // ------------------------------------------------------------------
    setSelectedCategory(categoryId) {
        super.setSelectedCategory(...arguments);
        this.gpHome = false;
        this.gpLimit = GP_PAGE_SIZE;
    },
    gpGoHome() {
        this.selectedCategory = undefined;
        this.searchProductWord = "";
        this.gpHome = true;
        this.gpLimit = GP_PAGE_SIZE;
    },
    gpShowAll() {
        this.selectedCategory = undefined;
        this.gpHome = false;
        this.gpLimit = GP_PAGE_SIZE;
    },
    gpShowMoreProducts() {
        this.gpLimit += GP_PAGE_SIZE;
    },
    gpSetFilter(filter) {
        this.gpFilter = filter;
        this.gpLimit = GP_PAGE_SIZE;
    },
    gpSetSort(sort) {
        this.gpSort = sort;
    },
    gpSetViewMode(mode) {
        this.gpViewMode = mode;
        writeLocalStorage(GP_VIEW_MODE_KEY, mode);
    },
    gpToggleCalculator() {
        this.gpShowCalculator = !this.gpShowCalculator;
        writeLocalStorage(GP_CALCULATOR_KEY, this.gpShowCalculator ? "1" : "0");
    },

    // ------------------------------------------------------------------
    // Products shown by the GARESE catalog
    // ------------------------------------------------------------------
    /** Every product template that can be sold in this Point of Sale. */
    get gpSellableProducts() {
        const excluded = new Set(this.getExcludedProductIds());
        const availableCateg = new Set((this.config.iface_available_categ_ids || []).map((c) => c.id));
        const special = this.config._pos_special_display_products_ids || [];
        return this.models["product.template"].filter(
            (p) =>
                p.canBeDisplayed &&
                !excluded.has(p.id) &&
                (!availableCateg.size ||
                    special.includes(p.id) ||
                    p.pos_categ_ids.some((c) => availableCateg.has(c.id)))
        );
    },
    gpProductsOfCategory(category) {
        if (!category) {
            return this.gpSellableProducts;
        }
        const ids = new Set(category.getAllChildren().map((c) => c.id));
        return this.gpSellableProducts.filter((p) => p.pos_categ_ids.some((c) => ids.has(c.id)));
    },
    gpCategoryCount(category) {
        return this.gpProductsOfCategory(category).length;
    },
    gpApplyFilter(products) {
        switch (this.gpFilter) {
            case "favorite":
                return products.filter((p) => p.gp_pos_favorite || p.is_favorite);
            case "promo":
                return products.filter((p) => p.gpPromo);
            case "stock":
                return products.filter((p) => !p.gpIsStorable || p._gp_qty > 0);
        }
        return products;
    },
    gpApplySort(products) {
        const list = [...products];
        const price = (p) => p.gpDisplayPrice();
        switch (this.gpSort) {
            case "name":
                return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            case "price_asc":
                return list.sort((a, b) => price(a) - price(b));
            case "price_desc":
                return list.sort((a, b) => price(b) - price(a));
            case "stock":
                return list.sort((a, b) => (b._gp_qty || 0) - (a._gp_qty || 0));
        }
        return this.orderProductBySequenceAndFav(list);
    },
    get gpPromoProducts() {
        return this.gpSellableProducts.filter((p) => p.gpPromo);
    },
    get gpPopularProducts() {
        return this.gpSellableProducts
            .filter((p) => p._gp_popular_rank > 0)
            .sort((a, b) => a._gp_popular_rank - b._gp_popular_rank);
    },

    // ------------------------------------------------------------------
    // Stock
    // ------------------------------------------------------------------
    async syncAllOrders(options = {}) {
        const result = await super.syncAllOrders(...arguments);
        if (this.config.gp_show_stock && Array.isArray(result) && result.length) {
            const templateIds = new Set();
            for (const order of result) {
                for (const line of order.lines || []) {
                    const tmpl = line.product_id?.product_tmpl_id;
                    if (tmpl) {
                        templateIds.add(tmpl.id);
                    }
                }
            }
            if (templateIds.size) {
                this.gpRefreshStock([...templateIds]);
            }
        }
        if (this.config.gp_daily_goal > 0 && Array.isArray(result) && result.length) {
            this.gpRefreshGoal();
        }
        return result;
    },
    /**
     * Re-read the stock of the given templates (all storable templates when
     * omitted). Never blocks a sale: offline, the badges keep their value.
     */
    async gpRefreshStock(templateIds) {
        if (!this.config.gp_show_stock) {
            return;
        }
        const ids =
            templateIds ||
            this.models["product.template"].filter((p) => p.gpIsStorable).map((p) => p.id);
        if (!ids.length) {
            return;
        }
        try {
            const stock = await this.data.silentCall("pos.session", "gp_get_stock", [
                [this.session.id],
                ids,
            ]);
            for (const [id, qty] of Object.entries(stock || {})) {
                const product = this.models["product.template"].get(Number(id));
                if (product) {
                    product._gp_qty = qty;
                }
            }
        } catch {
            // Offline or server error: keep the last known quantities.
        }
    },

    // ------------------------------------------------------------------
    // Favorites
    // ------------------------------------------------------------------
    get gpCanEditFavorites() {
        return !this.config.gp_favorite_manager_only || this.getCashier()?._role === "manager";
    },
    async gpToggleFavorite(product) {
        if (!this.gpCanEditFavorites) {
            return;
        }
        const value = !product.gp_pos_favorite;
        product.gp_pos_favorite = value;
        try {
            await this.data.silentCall("product.product", "gp_set_pos_favorite", [
                [product.product_variant_ids[0].id],
                value,
            ]);
        } catch {
            product.gp_pos_favorite = !value;
            this.gpNotify(_t("Favorites cannot be changed while offline."), "warning");
        }
    },

    // ------------------------------------------------------------------
    // Bag button / manual code entry
    // ------------------------------------------------------------------
    async gpAddBag() {
        const bag = this.config.gp_bag_product_id;
        if (!bag) {
            return;
        }
        let template = bag.product_tmpl_id;
        if (!template) {
            try {
                await this.data.searchRead("product.product", [["id", "=", bag.id]]);
            } catch {
                // handled below
            }
            template = this.models["product.product"].get(bag.id)?.product_tmpl_id;
        }
        if (!template) {
            this.dialog.add(AlertDialog, {
                title: _t("Bag product unavailable"),
                body: _t("The bag product could not be loaded. Check the Point of Sale settings."),
            });
            return;
        }
        await this.addLineToCurrentOrder({ product_tmpl_id: template, product_id: bag }, {});
    },
    async gpEnterCode() {
        const payload = await makeAwaitable(this.dialog, TextInputPopup, {
            title: _t("Enter a code"),
            placeholder: _t("Barcode or internal reference"),
        });
        const code = (payload || "").trim();
        if (!code) {
            return;
        }
        const lowered = code.toLowerCase();
        const byReference = this.models["product.product"].find(
            (product) => product.default_code && product.default_code.toLowerCase() === lowered
        );
        const byBarcode = this.models["product.product"].getBy?.("barcode", code);
        if (byReference && !byBarcode) {
            await this.addLineToCurrentOrder(
                { product_tmpl_id: byReference.product_tmpl_id, product_id: byReference },
                {}
            );
            return;
        }
        // Anything else goes through the barcode pipeline, as if it was scanned.
        await this.barcodeReader.scan(code);
    },

    // ------------------------------------------------------------------
    // Waiters
    // ------------------------------------------------------------------
    get gpWaiters() {
        return this.models["garese.pos.waiter"]?.getAll() || [];
    },
    get gpUseWaiter() {
        return Boolean(this.config.gp_use_waiter) && this.gpWaiters.length > 0;
    },
    async gpPickWaiter({ title, selected = false, allowNone = true } = {}) {
        const list = this.gpWaiters.map((waiter) => ({
            id: waiter.id,
            label: waiter.name,
            isSelected: waiter.id === selected?.id,
            item: waiter,
        }));
        if (allowNone) {
            list.push({ id: 0, label: _t("No waiter"), isSelected: !selected, item: "none" });
        }
        const payload = await makeAwaitable(this.dialog, SelectionPopup, {
            title: title || _t("Who serves this order?"),
            list,
        });
        if (payload === undefined) {
            return undefined;
        }
        return payload === "none" ? false : payload;
    },
    /** @returns {Promise<boolean>} true when a choice was made */
    async gpSelectWaiter(order = this.getOrder(), options = {}) {
        if (!order || !this.gpUseWaiter) {
            return false;
        }
        const waiter = await this.gpPickWaiter({ selected: order.gp_waiter_id, ...options });
        if (waiter === undefined) {
            return false;
        }
        order.gp_waiter_id = waiter || false;
        return true;
    },
    async pay() {
        const order = this.getOrder();
        if (
            order &&
            this.config.gp_waiter_required &&
            this.gpUseWaiter &&
            !order.gp_waiter_id &&
            !order.isEmpty()
        ) {
            const chosen = await this.gpSelectWaiter(order, { allowNone: false });
            if (!chosen || !order.gp_waiter_id) {
                return;
            }
        }
        return super.pay(...arguments);
    },

    // ------------------------------------------------------------------
    // Often bought together
    // ------------------------------------------------------------------
    async gpLoadAffinity() {
        try {
            this.gpAffinity =
                (await this.data.silentCall("pos.config", "gp_affinity", [this.config.id])) || {};
        } catch {
            this.gpAffinity = {};
        }
    },
    /** Templates to suggest for a template, only the ones sellable here. */
    gpSuggestionsFor(template, excludeTemplateIds = []) {
        if (!template) {
            return [];
        }
        const sellable = new Set(this.gpSellableProducts.map((p) => p.id));
        const result = [];
        for (const variant of template.product_variant_ids) {
            for (const id of this.gpAffinity[variant.id] || []) {
                const other = this.models["product.product"].get(id)?.product_tmpl_id;
                if (
                    other &&
                    other.id !== template.id &&
                    sellable.has(other.id) &&
                    !excludeTemplateIds.includes(other.id) &&
                    !result.includes(other)
                ) {
                    result.push(other);
                }
            }
        }
        return result.slice(0, 3);
    },

    // ------------------------------------------------------------------
    // Daily goal
    // ------------------------------------------------------------------
    get gpGoal() {
        const target = this.config.gp_daily_goal;
        if (!(target > 0)) {
            return false;
        }
        const amount = this.gpTodaySales;
        return {
            target: this.gpFormat(target),
            amount: this.gpFormat(amount),
            left: this.gpFormat(Math.max(0, target - amount)),
            percent: Math.min(100, Math.round((amount / target) * 100)),
            reached: amount >= target,
        };
    },
    async gpRefreshGoal(notify = true) {
        try {
            const amount = await this.data.silentCall("pos.config", "gp_today_sales", [
                this.config.id,
            ]);
            const before = this.gpTodaySales;
            const target = this.config.gp_daily_goal;
            this.gpTodaySales = amount || 0;
            if (notify && !this.gpGoalReached && before < target && amount >= target) {
                this.gpGoalReached = true;
                this.gpSound?.("goal");
                this.gpNotify(_t("Daily goal reached, well done!"), "success");
            } else if (amount >= target) {
                this.gpGoalReached = true;
            }
        } catch {
            // Offline: keep the last known figure.
        }
    },

    // ------------------------------------------------------------------
    // Recent customers
    // ------------------------------------------------------------------
    async gpPickRecentCustomer() {
        const order = this.getOrder();
        if (!order) {
            return;
        }
        let customers = [];
        try {
            customers = await this.data.call("res.partner", "gp_recent_customers", [this.config.id]);
        } catch {
            this.gpNotify(_t("Recent customers need a connection."), "warning");
            return;
        }
        if (!customers?.length) {
            this.gpNotify(_t("No customer has been served yet."));
            return;
        }
        const list = customers.map((customer) => ({
            id: customer.id,
            label: `${customer.name} · ${this.gpFormat(customer.total)}`,
            isSelected: order.getPartner()?.id === customer.id,
            item: customer.id,
        }));
        const partnerId = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Recent customers"),
            list,
        });
        if (!partnerId) {
            return;
        }
        let partner = this.models["res.partner"].get(partnerId);
        if (!partner) {
            try {
                await this.data.read("res.partner", [partnerId]);
            } catch {
                // handled below
            }
            partner = this.models["res.partner"].get(partnerId);
        }
        if (partner) {
            order.setPartner(partner);
        } else {
            this.gpNotify(_t("This customer is not loaded in this register."), "warning");
        }
    },

    // ------------------------------------------------------------------
    // Low stock alert, right after a product is added
    // ------------------------------------------------------------------
    gpLowStockAlert(template) {
        if (!this.config.gp_show_stock || !template?.gpIsStorable) {
            return;
        }
        const inCart = (this.getOrder()?.lines || [])
            .filter((line) => line.product_id?.product_tmpl_id?.id === template.id)
            .reduce((sum, line) => sum + line.qty, 0);
        const left = (template._gp_qty || 0) - inCart;
        if (left < 0 || (left <= 0 && inCart > 0)) {
            this.gpNotify(_t("%s: no stock left.", template.display_name), "danger");
            this.gpSound?.("error");
        } else if (left <= this.config.gp_low_stock_threshold) {
            this.gpNotify(
                _t("%(product)s: only %(qty)s left.", { product: template.display_name, qty: left }),
                "warning"
            );
        }
    },
});
