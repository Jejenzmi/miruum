-- Tour module
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Wisata',
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL DEFAULT 4,
    "price" INTEGER NOT NULL,
    "maxPax" INTEGER NOT NULL DEFAULT 20,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingPoint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tour_active_idx" ON "Tour"("active");

CREATE TABLE "TourBooking" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bookerName" TEXT NOT NULL,
    "bookerPhone" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourBooking_code_key" ON "TourBooking"("code");
CREATE INDEX "TourBooking_userId_idx" ON "TourBooking"("userId");
CREATE INDEX "TourBooking_tourId_idx" ON "TourBooking"("tourId");
ALTER TABLE "TourBooking" ADD CONSTRAINT "TourBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TourBooking" ADD CONSTRAINT "TourBooking_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shuttle module
CREATE TABLE "ShuttleVehicleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'car',
    "baseFare" INTEGER NOT NULL DEFAULT 8000,
    "perKm" INTEGER NOT NULL DEFAULT 4000,
    "minFare" INTEGER NOT NULL DEFAULT 12000,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShuttleVehicleType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShuttleRide" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,
    "originLabel" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destLabel" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "fare" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "driverName" TEXT,
    "driverPhone" TEXT,
    "driverPlate" TEXT,
    "driverRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShuttleRide_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShuttleRide_code_key" ON "ShuttleRide"("code");
CREATE INDEX "ShuttleRide_userId_idx" ON "ShuttleRide"("userId");
ALTER TABLE "ShuttleRide" ADD CONSTRAINT "ShuttleRide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShuttleRide" ADD CONSTRAINT "ShuttleRide_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "ShuttleVehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
