/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { ProductsWidget } from "@point_of_sale/app/screens/product_screen/product_list/product_list";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { GpCategoryBar } from "@garese_pos/app/category_bar/category_bar";

const AUTO_COLORS = ["blue", "green", "orange", "red", "purple", "teal", "pink", "yellow"];
const DEFAULT_ICON = "fa-tag";

ProductsWidget.components = { ...ProductsWidget.components, GpCategoryBar };
// Extra display data of the GARESE card (stock, favorite, popular).
ProductCard.props = { ...ProductCard.props, gp: { type: Object, optional: true } };

patch(ProductsWidget.prototype, {
    /**
     * The search field sits in the top bar, away from the category tiles:
     * cashiers expect it to search the whole catalog, not the open category.
     * (Small screens keep the standard "search in category" behaviour.)
     */
    get selectedCategoryId() {
        if (!this.ui.isSmall && this.searchWord !== "") {
            return this.pos.db.root_category_id;
        }
        return super.selectedCategoryId;
    },

    // ------------------------------------------------------------------
    // Category tiles
    // ------------------------------------------------------------------
    /**
     * Ids of the products of a category (children included). The index of the
     * standard PosDB lists a product once per category it belongs to, so a
     * product with two categories appears twice under their common ancestor.
     */
    gpCategoryProductIds(categoryId) {
        const { db } = this.pos;
        const hidden = [...this.getProductListToNotDisplay(), ...db.product_ids_to_not_display];
        const ids = new Set(db.product_by_category_id[categoryId] || []);
        return [...ids].filter((id) => {
            const product = db.product_by_id[id];
            return product && product.active && product.available_in_pos && !hidden.includes(id);
        });
    },
    gpCategoryCount(categoryId) {
        return this.gpCategoryProductIds(categoryId).length;
    },
    get gpCategoryTiles() {
        const { db } = this.pos;
        const showImages = this.pos.show_category_images;
        return db.get_category_childs_ids(db.root_category_id).map((id, index) => {
            const category = db.category_by_id[id];
            return {
                id,
                name: category.name,
                count: this.gpCategoryCount(id),
                color: category.gp_color || AUTO_COLORS[index % AUTO_COLORS.length],
                icon: category.gp_icon || DEFAULT_ICON,
                imageUrl:
                    showImages &&
                    category.has_image &&
                    `/web/image?model=pos.category&field=image_128&id=${id}&unique=${category.write_date}`,
            };
        });
    },
    /** Top level category owning the selected one (0 when none). */
    get gpActiveRootId() {
        const { db } = this.pos;
        const selected = this.pos.selectedCategoryId;
        if (!selected || selected === db.root_category_id) {
            return 0;
        }
        const ancestors = db
            .get_category_ancestors_ids(selected)
            .filter((id) => id !== db.root_category_id);
        return ancestors.length ? ancestors[0] : selected;
    },
    /** Breadcrumb + children of the selected category, for the chips row. */
    get gpSubCategories() {
        const { db } = this.pos;
        const selected = this.pos.selectedCategoryId;
        if (this.pos.gpHome || !selected || selected === db.root_category_id) {
            return null;
        }
        const toItem = (id) => ({ id, name: db.category_by_id[id].name });
        const ancestors = db
            .get_category_ancestors_ids(selected)
            .filter((id) => id !== db.root_category_id);
        let path = [...ancestors, selected];
        let children = db.get_category_childs_ids(selected);
        if (!children.length && ancestors.length) {
            // Leaf category: keep its siblings at hand instead of a dead end.
            path = ancestors;
            children = db.get_category_childs_ids(ancestors[ancestors.length - 1]);
        }
        if (path.length < 2 && !children.length) {
            return null;
        }
        path = path.map(toItem);
        children = children.map(toItem);
        return { path, children, selected };
    },

    // ------------------------------------------------------------------
    // Product lists
    // ------------------------------------------------------------------
    gpMatchesFilter(product) {
        switch (this.pos.gpFilter) {
            case "favorite":
                return Boolean(product.gp_pos_favorite);
            case "promo":
                return product.gpIsPromo;
            case "stock":
                return !product.gpIsStorable || product.gp_qty > 0;
            default:
                return true;
        }
    },
    gpSort(products) {
        const price = (product) => product.get_display_price();
        switch (this.pos.gpSort) {
            case "price_asc":
                return products.sort((a, b) => price(a) - price(b));
            case "price_desc":
                return products.sort((a, b) => price(b) - price(a));
            case "stock":
                return products.sort((a, b) => (b.gp_qty || 0) - (a.gp_qty || 0));
            default:
                return products; // already sorted by name by the standard widget
        }
    },
    /** Best sellers, shown first on the Home view. */
    get gpPopularToDisplay() {
        if (!this.pos.gpHome || this.searchWord !== "" || this.pos.selectedCategoryId) {
            return [];
        }
        const { db } = this.pos;
        return this.gpCategoryProductIds(db.root_category_id)
            .map((id) => db.product_by_id[id])
            .filter(
                (product) =>
                    product && product.gp_popular_rank > 0 && this.gpMatchesFilter(product)
            )
            .sort((a, b) => a.gp_popular_rank - b.gp_popular_rank);
    },
    get gpShowSections() {
        return this.gpPopularToDisplay.length > 0;
    },
    /**
     * Standard list (category + search, hidden products removed, sorted by
     * name) with the GARESE filter and sort applied. On the Home view the
     * best sellers are shown in their own section, so they are left out here.
     */
    get productsToDisplay() {
        let products = super.productsToDisplay.filter((product) => this.gpMatchesFilter(product));
        if (this.ui.isSmall) {
            return products;
        }
        if (this.gpShowSections) {
            products = products.filter((product) => !(product.gp_popular_rank > 0));
        }
        return this.gpSort(products);
    },
    get gpHasMoreProducts() {
        if (this.searchWord !== "") {
            return false; // the standard "Search more" button takes over
        }
        // PosDB.get_product_by_category only reads the first `limit` entries
        // of its index: there is more to show as long as the index is longer.
        const { db } = this.pos;
        const index = db.product_by_category_id[this.pos.selectedCategoryId || db.root_category_id];
        return (index || []).length > db.limit;
    },
    get gpListTitle() {
        if (this.searchWord !== "") {
            return _t('Results for "%s"', this.searchWord);
        }
        if (this.gpShowSections) {
            return _t("Popular products");
        }
        const { db } = this.pos;
        const selected = this.pos.selectedCategoryId;
        if (!selected || selected === db.root_category_id) {
            return _t("All products");
        }
        return db.category_by_id[selected]?.name || _t("All products");
    },
    get gpFilters() {
        const filters = [
            { key: "all", label: _t("All") },
            { key: "favorite", label: _t("Favorites"), icon: "fa-star" },
            { key: "promo", label: _t("Promo"), icon: "fa-tag" },
        ];
        if (this.pos.config.gp_show_stock) {
            filters.push({ key: "stock", label: _t("In stock"), icon: "fa-archive" });
        }
        return filters;
    },
    async gpOpenSort() {
        const options = [
            { key: "default", label: _t("Name (A to Z)") },
            { key: "price_asc", label: _t("Price: low to high") },
            { key: "price_desc", label: _t("Price: high to low") },
        ];
        if (this.pos.config.gp_show_stock) {
            options.push({ key: "stock", label: _t("Stock: highest first") });
        }
        const { confirmed, payload } = await this.popup.add(SelectionPopup, {
            title: _t("Sort products"),
            list: options.map((option, index) => ({
                id: index,
                label: option.label,
                isSelected: option.key === this.pos.gpSort,
                item: option.key,
            })),
        });
        if (confirmed) {
            this.pos.gpSetSort(payload);
        }
    },

    // ------------------------------------------------------------------
    // Product card
    // ------------------------------------------------------------------
    gpFormatStock(quantity) {
        const rounded = Number((quantity || 0).toFixed(2));
        return String(rounded).replace(".", this.env.services.localization.decimalPoint);
    },
    gpCardData(product) {
        if (this.ui.isSmall) {
            return undefined; // standard mobile cards
        }
        const stockState = product.gpStockState;
        let stockLabel = "";
        if (stockState === "out") {
            stockLabel = _t("No stock");
        } else if (stockState) {
            stockLabel = _t("In stock: %s", this.gpFormatStock(product.gp_qty));
        }
        return {
            favorite: Boolean(product.gp_pos_favorite),
            canFavorite: this.pos.gpCanEditFavorites,
            popular: product.gp_popular_rank > 0,
            stockState,
            stockLabel,
            placeholder: Boolean(this.pos.show_product_images && !product.image_128),
            onToggleFavorite: () => this.pos.gpToggleFavorite(product),
        };
    },
});
