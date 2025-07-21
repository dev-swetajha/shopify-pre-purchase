import React, { useEffect, useState } from "react";
import {
  reactExtension,
  Divider,
  Banner,
  Heading,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  Checkbox,
  useCartLines,
  useApplyCartLinesChange,
  useApi,
} from "@shopify/ui-extensions-react/checkout";

// Set up the entry point for the extension
export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { query, i18n } = useApi();
  const applyCartLinesChange = useApplyCartLinesChange();
  const lines = useCartLines();

  const [liftgateProduct, setLiftgateProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [liftgateProcessing, setLiftgateProcessing] = useState(false);

  const LIFTGATE_PRODUCT_ID = "gid://shopify/Product/9010608767196";

  useEffect(() => {
    fetchLiftgateProduct();
  }, []);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Auto-sync liftgate quantity when pallet count changes
  useEffect(() => {
    if (!liftgateProduct) return;

    const palletCount = getPalletCountFromCart(lines);
    const liftgateVariantId = liftgateProduct.variants.nodes[0].id;
    const liftgateLine = lines.find(line => line.merchandise.id === liftgateVariantId);

    // If liftgate is in cart but quantity doesn't match pallet count, update it
    if (liftgateLine && palletCount > 0 && liftgateLine.quantity !== palletCount) {
      applyCartLinesChange({
        type: "updateCartLine",
        id: liftgateLine.id,
        quantity: palletCount,
      });
    }
    // If liftgate is in cart but no pallets, remove it
    else if (liftgateLine && palletCount === 0) {
      applyCartLinesChange({
        type: "updateCartLine",
        id: liftgateLine.id,
        quantity: 0,
      });
    }
  }, [lines, liftgateProduct, applyCartLinesChange]);

  async function fetchLiftgateProduct() {
    setLoading(true);
    try {
      const { data } = await query(
        `query ($id: ID!) {
          node(id: $id) {
            ... on Product {
              id
              title
              variants(first: 1) {
                nodes {
                  id
                  price { amount }
                }
              }
            }
          }
        }`,
        { variables: { id: LIFTGATE_PRODUCT_ID } }
      );

      const product = data?.node;
      if (product) {
        setLiftgateProduct(product);
      }
    } catch (error) {
      console.error("Error fetching product:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLiftgateChange(checked) {
    if (!liftgateProduct) return;

    setLiftgateProcessing(true);
    const palletCount = getPalletCountFromCart(lines);
    const variantId = liftgateProduct.variants.nodes[0].id;
    const liftgateLine = lines.find(line => line.merchandise.id === variantId);

    try {
      if (checked && palletCount > 0) {
        if (liftgateLine) {
          await applyCartLinesChange({
            type: "updateCartLine",
            id: liftgateLine.id,
            quantity: palletCount,
          });
        } else {
          await applyCartLinesChange({
            type: "addCartLine",
            merchandiseId: variantId,
            quantity: palletCount,
          });
        }
      } else if (liftgateLine) {
        await applyCartLinesChange({
          type: "updateCartLine",
          id: liftgateLine.id,
          quantity: 0,
        });
      }
    } catch (error) {
      setShowError(true);
      console.error("Liftgate operation failed:", error);
    } finally {
      setLiftgateProcessing(false);
    }
  }

  const palletCount = getPalletCountFromCart(lines);
  const liftgateVariantId = liftgateProduct?.variants.nodes[0].id;
  const needsLiftgate = liftgateVariantId ? lines.some(line => line.merchandise.id === liftgateVariantId) : false;

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <BlockStack spacing="loose">
      {palletCount > 0 && (
        <LiftgateOption
          product={liftgateProduct}
          i18n={i18n}
          needsLiftgate={needsLiftgate}
          processing={liftgateProcessing}
          palletCount={palletCount}
          onLiftgateChange={handleLiftgateChange}
        />
      )}
      {showError && <ErrorBanner />}
    </BlockStack>
  );
}

function LiftgateOption({ product, i18n, needsLiftgate, processing, palletCount, onLiftgateChange }) {
  if (!product || palletCount === 0) {
    return null;
  }

  const renderPrice = i18n.formatCurrency(
    product.variants.nodes[0].price.amount * palletCount
  );

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>Delivery Options</Heading>
      <BlockStack spacing="base">
        <Checkbox
          checked={needsLiftgate}
          onChange={onLiftgateChange}
          disabled={processing}
        >
          <BlockStack spacing="extraTight">
            <Text size="medium">Do you need a liftgate?</Text>
            <Text size="small" appearance="subdued">
              Liftgate service for ground-level delivery (+{renderPrice} for {palletCount} pallet{palletCount > 1 ? "s" : ""})
            </Text>
          </BlockStack>
        </Checkbox>
      </BlockStack>
    </BlockStack>
  );
}

function LoadingSkeleton() {
  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>Delivery Options</Heading>
      <BlockStack spacing="loose">
        <SkeletonText inlineSize="large" />
        <SkeletonText inlineSize="small" />
      </BlockStack>
    </BlockStack>
  );
}

function getPalletCountFromCart(lines) {
  return lines.reduce((count, line) => {
    const sku = line.merchandise?.sku || "";
    if (sku.toUpperCase().includes("PALLET")) {
      return count + line.quantity;
    }
    return count;
  }, 0);
}

function ErrorBanner() {
  return (
    <Banner status="critical">
      There was an issue adding this product. Please try again.
    </Banner>
  );
}