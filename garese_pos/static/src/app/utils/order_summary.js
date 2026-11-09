/**
 * Tax rate shown next to the tax line: "18%" when the order carries a single
 * percentage tax, "0%" when it carries none, "" when several are mixed.
 */
export function gpTaxRateLabel(order) {
    const taxes = new Map();
    for (const line of order.lines || []) {
        for (const tax of line.tax_ids || []) {
            taxes.set(tax.id, tax);
        }
    }
    if (!taxes.size) {
        return "0%";
    }
    const [tax] = [...taxes.values()];
    if (taxes.size === 1 && tax.amount_type === "percent") {
        return `${tax.amount}%`;
    }
    return "";
}

function rounder(order) {
    const rounding = order.currency?.rounding || 0.01;
    return (value) => Math.round(value / rounding) * rounding;
}

/**
 * Figures of the totals block, such that subtotal - discount + tax = total:
 * the subtotal is the untaxed amount *before* line discounts.
 */
export function gpOrderAmounts(order) {
    const round = rounder(order);
    const untaxed = order.priceExcl;
    const beforeDiscount = (order.lines || []).reduce(
        (sum, line) => sum + (line.priceExclNoDiscount ?? line.priceExcl),
        0
    );
    const discount = Math.max(round(beforeDiscount - untaxed), 0);
    return { subtotal: untaxed + discount, discount, tax: order.amountTaxes, total: order.priceIncl };
}

/** Same figures with taxes included: subtotal - discount = total. */
export function gpOrderAmountsTaxIncluded(order) {
    const round = rounder(order);
    const total = order.priceIncl;
    const beforeDiscount = (order.lines || []).reduce(
        (sum, line) => sum + (line.priceInclNoDiscount ?? line.priceIncl),
        0
    );
    const discount = Math.max(round(beforeDiscount - total), 0);
    return { subtotal: total + discount, discount, tax: order.amountTaxes, total };
}

/** Discount / subtotal / taxes / total of an order, formatted for display. */
export function gpOrderSummary(order, env) {
    const format = (amount) => env.utils.formatCurrency(amount || 0);
    if (!order) {
        return { discount: format(0), hasDiscount: false, subtotal: format(0), tax: format(0), taxRate: "", total: format(0) };
    }
    const amounts = gpOrderAmounts(order);
    const hasDiscount = Math.abs(amounts.discount) > 0.000001;
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
