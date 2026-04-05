import type { Prisma, RegistrationType } from "@prisma/client";

export function getShacklesPrefix(input: { year: number; registrationType: RegistrationType }) {
  const yearShort = String(input.year % 100).padStart(2, "0");
  const typeSegment = input.registrationType === "WORKSHOP"
    ? "W"
    : input.registrationType === "COMBO"
    ? "C"
    : "G";

  return `SH${yearShort}${typeSegment}`;
}

export async function allocateShacklesId(input: {
  tx: Prisma.TransactionClient;
  year: number;
  registrationType: RegistrationType;
  startFrom?: number;
}) {
  const requestedStart = Number.isFinite(input.startFrom) ? Math.max(1, Math.trunc(input.startFrom as number)) : 1;

  let sequence = await input.tx.shacklesIdSequence.upsert({
    where: {
      year_registrationType: {
        year: input.year,
        registrationType: input.registrationType,
      },
    },
    update: {
      lastIssued: {
        increment: 1,
      },
    },
    create: {
      year: input.year,
      registrationType: input.registrationType,
      lastIssued: requestedStart,
    },
    select: {
      lastIssued: true,
    },
  });

  // When switching to a higher floor (e.g. on-spot should begin at 500),
  // bump current sequence only if it is still below that floor.
  if (sequence.lastIssued < requestedStart) {
    sequence = await input.tx.shacklesIdSequence.update({
      where: {
        year_registrationType: {
          year: input.year,
          registrationType: input.registrationType,
        },
      },
      data: {
        lastIssued: requestedStart,
      },
      select: {
        lastIssued: true,
      },
    });
  }

  const prefix = getShacklesPrefix({
    year: input.year,
    registrationType: input.registrationType,
  });

  return `${prefix}${String(sequence.lastIssued).padStart(3, "0")}`;
}
