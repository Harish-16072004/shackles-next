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
}) {
  const sequence = await input.tx.shacklesIdSequence.upsert({
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
      lastIssued: 1,
    },
    select: {
      lastIssued: true,
    },
  });

  const prefix = getShacklesPrefix({
    year: input.year,
    registrationType: input.registrationType,
  });

  return `${prefix}${String(sequence.lastIssued).padStart(3, "0")}`;
}
