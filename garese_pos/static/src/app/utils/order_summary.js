/** @odoo-module */

/**
 * Tax rate shown next to the tax line: "18%" when the order carries a single
 * percentage tax, "0%" when it carries none, "" when several taxes are mixed
 * (a single figure would be misleading).
 */
export function gpTaxRateLabel(order) {
    const taxDetails = order.get_tax_details();
    if (!taxDetails.length) {
        return "0%";
    }
    if (taxDetails.length === 1 && taxDetails[0].tax?.amount_type === "percent") {
        return `${taxDetails[0].tax.amount}%`;
    }
    return "";
}

/**
 * Figures of the totals block, such that
 *     subtotal - discount + tax = total
 * whatever the tax display mode: the subtotal is the untaxed amount *before*
 * line discounts and the discount is untaxed as well.
 */
export function gpOrderAmounts(order) {
    const rounding = order.pos.currency.rounding;
    const round = (value) => Math.round(value / rounding) * rounding;
    const untaxed = order.get_total_without_tax();
    const beforeDiscount = order
        .get_orderlines()
        .reduce((sum, line) => sum + line.get_all_prices().priceWithoutTaxBeforeDiscount, 0);
    const discount = Math.max(round(beforeDiscount - untaxed), 0);
    return {
        subtotal: untaxed + discount,
        discount,
        tax: order.get_total_tax(),
        total: order.get_total_with_tax(),
    };
}

/**
 * Same figures with taxes included, for the receipt printed without its tax
 * line:  subtotal - discount = total.
 */
export function gpOrderAmountsTaxIncluded(order) {
    const rounding = order.pos.currency.rounding;
    const round = (value) => Math.round(value / rounding) * rounding;
    const total = order.get_total_with_tax();
    const beforeDiscount = order
        .get_orderlines()
        .reduce((sum, line) => sum + line.get_all_prices().priceWithTaxBeforeDiscount, 0);
    const discount = Math.max(round(beforeDiscount - total), 0);
    return {
        subtotal: total + discount,
        discount,
        tax: order.get_total_tax(),
        total,
    };
}

/**
 * Discount / subtotal / taxes / total of an order, formatted for display.
 * Shared by the product screen and the payment screen.
 */
export function gpOrderSummary(order, env) {
    const format = (amount) => env.utils.formatCurrency(amount);
    if (!order) {
        return {
            discount: format(0),
            hasDiscount: false,
            subtotal: format(0),
            tax: format(0),
            taxRate: "",
            total: format(0),
        };
    }
    const amounts = gpOrderAmounts(order);
    const hasDiscount = !env.utils.floatIsZero(amounts.discount);
    return {
        discount: (hasDiscount ? "- " : "") + format(amounts.discount),
        hasDiscount,
        subtotal: format(amounts.subtotal),
        tax: format(amounts.tax),
        taxRate: gpTaxRateLabel(order),
        total: format(amounts.total),
    };
}

/** "5000, 10 000;20000" -> [5000, 10000, 20000] (invalid chunks are skipped). */
export function gpParseAmounts(text) {
    return String(text || "")
        .split(/[;,]/)
        .map((chunk) => Number(chunk.replace(/\s/g, "")))
        .filter((amount) => Number.isFinite(amount) && amount > 0);
}
