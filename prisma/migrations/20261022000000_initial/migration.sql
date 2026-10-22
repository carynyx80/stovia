-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Block" (
    "number" BIGINT NOT NULL,
    "hash" TEXT NOT NULL,
    "parentHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "ProtocolEvent" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "address" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "args" JSONB NOT NULL,

    CONSTRAINT "ProtocolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cursor" (
    "id" TEXT NOT NULL,
    "nextBlock" BIGINT NOT NULL,

    CONSTRAINT "Cursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Launch" (
    "token" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "feePercent" INTEGER NOT NULL,
    "supply" DECIMAL(78,0) NOT NULL,
    "metadataURI" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,

    CONSTRAINT "Launch_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Token" (
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "ApprovedStock" (
    "address" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "oracle" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApprovedStock_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "TradingPair" (
    "market" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "quote" TEXT NOT NULL,

    CONSTRAINT "TradingPair_pkey" PRIMARY KEY ("market")
);

-- CreateTable
CREATE TABLE "Pool" (
    "market" TEXT NOT NULL,
    "tokenReserve" DECIMAL(78,0) NOT NULL,
    "quoteReserve" DECIMAL(78,0) NOT NULL,
    "graduated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("market")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "tokenAmount" DECIMAL(78,0) NOT NULL,
    "quoteAmount" DECIMAL(78,0) NOT NULL,
    "fee" DECIMAL(78,0) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(78,18) NOT NULL,
    "high" DECIMAL(78,18) NOT NULL,
    "low" DECIMAL(78,18) NOT NULL,
    "close" DECIMAL(78,18) NOT NULL,
    "volume" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorFee" (
    "token" TEXT NOT NULL,
    "generated" DECIMAL(78,0) NOT NULL,
    "protocol" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "CreatorFee_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "FeeClaim" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "blockNumber" BIGINT NOT NULL,

    CONSTRAINT "FeeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Graduation" (
    "token" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "quoteReserve" DECIMAL(78,0) NOT NULL,
    "tokenReserve" DECIMAL(78,0) NOT NULL,
    "blockNumber" BIGINT NOT NULL,

    CONSTRAINT "Graduation_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "WalletActivity" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "WalletActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OracleSnapshot" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "price" DECIMAL(78,18) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "valid" BOOLEAN NOT NULL,

    CONSTRAINT "OracleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvent" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadChallenge" (
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadChallenge_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "TokenMetadata" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "image" BYTEA,
    "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holder" (
    "token" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "balance" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "Holder_pkey" PRIMARY KEY ("token","wallet")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_hash_key" ON "Block"("hash");

-- CreateIndex
CREATE INDEX "ProtocolEvent_kind_blockNumber_idx" ON "ProtocolEvent"("kind", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolEvent_transactionHash_logIndex_key" ON "ProtocolEvent"("transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Launch_market_key" ON "Launch"("market");

-- CreateIndex
CREATE INDEX "Launch_creator_idx" ON "Launch"("creator");

-- CreateIndex
CREATE UNIQUE INDEX "TradingPair_token_key" ON "TradingPair"("token");

-- CreateIndex
CREATE INDEX "Trade_market_timestamp_idx" ON "Trade"("market", "timestamp");

-- CreateIndex
CREATE INDEX "Trade_trader_idx" ON "Trade"("trader");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_market_interval_timestamp_key" ON "Candle"("market", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "UploadChallenge_address_createdAt_idx" ON "UploadChallenge"("address", "createdAt");

-- CreateIndex
CREATE INDEX "Holder_wallet_idx" ON "Holder"("wallet");

-- AddForeignKey
ALTER TABLE "ProtocolEvent" ADD CONSTRAINT "ProtocolEvent_blockNumber_fkey" FOREIGN KEY ("blockNumber") REFERENCES "Block"("number") ON DELETE CASCADE ON UPDATE CASCADE;

