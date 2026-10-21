import { pgTable, serial, varchar, text, integer, date, timestamp, boolean, unique } from "drizzle-orm/pg-core";

export const mahasiswa = pgTable("mahasiswa", {
  id: serial().primaryKey(),
  nama: varchar({ length: 100 }).notNull(),
  nim: varchar({ length: 20 }).notNull().unique(),
  email: varchar({ length: 100 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  approved: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const dosen = pgTable("dosen", {
  id: serial().primaryKey(),
  nama: varchar({ length: 100 }).notNull(),
  nip: varchar({ length: 30 }).notNull().unique(),
  email: varchar({ length: 100 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const matakuliah = pgTable("matakuliah", {
  id: serial().primaryKey(),
  nama: varchar({ length: 100 }).notNull(),
  kode: varchar({ length: 20 }).notNull().unique(),
  sks: integer().notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const mahasiswaDosen = pgTable("mahasiswa_dosen", {
  id: serial().primaryKey(),
  mahasiswaId: integer("mahasiswa_id").notNull().references(() => mahasiswa.id, { onDelete: "cascade" }),
  dosenId: integer("dosen_id").notNull().references(() => dosen.id, { onDelete: "cascade" }),
  matakuliahId: integer("matakuliah_id").notNull().references(() => matakuliah.id, { onDelete: "cascade" }),
}, (t) => [unique().on(t.mahasiswaId, t.dosenId, t.matakuliahId)]);

export const materi = pgTable("materi", {
  id: serial().primaryKey(),
  matakuliahId: integer("matakuliah_id").references(() => matakuliah.id, { onDelete: "set null" }),
  judul: varchar({ length: 200 }).notNull(),
  tipe: varchar({ length: 50 }).default("PDF"),
  deskripsi: text(),
  tanggal: date(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tugas = pgTable("tugas", {
  id: serial().primaryKey(),
  matakuliahId: integer("matakuliah_id").references(() => matakuliah.id, { onDelete: "set null" }),
  judul: varchar({ length: 200 }).notNull(),
  deadline: date(),
  deskripsi: text(),
  status: varchar({ length: 50 }).default("Belum dikumpulkan"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tugasPengumpulan = pgTable("tugas_pengumpulan", {
  id: serial().primaryKey(),
  tugasId: integer("tugas_id").notNull().references(() => tugas.id, { onDelete: "cascade" }),
  mahasiswaId: integer("mahasiswa_id").references(() => mahasiswa.id, { onDelete: "set null" }),
  mahasiswaNama: varchar("mahasiswa_nama", { length: 150 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 255 }),
  catatan: text(),
  tanggal: date(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.tugasId, t.mahasiswaId)]);

export const nilai = pgTable("nilai", {
  id: serial().primaryKey(),
  mahasiswaNama: varchar("mahasiswa_nama", { length: 150 }).notNull(),
  tugasId: integer("tugas_id").references(() => tugas.id, { onDelete: "set null" }),
  matakuliahId: integer("matakuliah_id").references(() => matakuliah.id, { onDelete: "set null" }),
  nilai: integer().notNull(),
  feedback: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pengumuman = pgTable("pengumuman", {
  id: serial().primaryKey(),
  judul: varchar({ length: 200 }).notNull(),
  isi: text().notNull(),
  tanggal: date(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Sesi login disimpan di database agar tetap berlaku di semua instance serverless.
export const authSessions = pgTable("auth_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: integer("user_id").notNull(),
  role: varchar({ length: 20 }).notNull(),
  identifier: varchar({ length: 30 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const passwordResets = pgTable("password_resets", {
  sessionKey: varchar("session_key", { length: 200 }).primaryKey(),
  code: varchar({ length: 12 }).notNull(),
  name: varchar({ length: 150 }),
  verified: boolean().notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
