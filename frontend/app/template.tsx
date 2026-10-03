"use client";

import { motion } from "motion/react";

/** Subtle page transition — opacity + 4px settle. Disabled under reduced motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex min-w-0 flex-1 flex-col">
      {children}
    </motion.div>
  );
}
