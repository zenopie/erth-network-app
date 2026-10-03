/**
 * The ERTH price in USD, or null.
 *
 * Always null: the chain has no USD reference until a pool against a
 * dollar-denominated asset exists (see DisplayCurrencyContext, where USD is
 * listed but disabled). This used to poll a backend /erth-price route every
 * minute from every open page, a request that leaked who was browsing to the
 * API host for a number the UI could not show. Callers already render nothing
 * for a null price.
 */
const useErthPrice = () => null;

export default useErthPrice;
