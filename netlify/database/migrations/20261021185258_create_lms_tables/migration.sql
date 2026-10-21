CREATE TABLE "auth_sessions" (
	"token_hash" varchar(64) PRIMARY KEY,
	"user_id" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"identifier" varchar(30) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dosen" (
	"id" serial PRIMARY KEY,
	"nama" varchar(100) NOT NULL,
	"nip" varchar(30) NOT NULL UNIQUE,
	"email" varchar(100) NOT NULL UNIQUE,
	"password" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mahasiswa" (
	"id" serial PRIMARY KEY,
	"nama" varchar(100) NOT NULL,
	"nim" varchar(20) NOT NULL UNIQUE,
	"email" varchar(100) NOT NULL UNIQUE,
	"password" varchar(255) NOT NULL,
	"approved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mahasiswa_dosen" (
	"id" serial PRIMARY KEY,
	"mahasiswa_id" integer NOT NULL,
	"dosen_id" integer NOT NULL,
	"matakuliah_id" integer NOT NULL,
	CONSTRAINT "mahasiswa_dosen_mahasiswa_id_dosen_id_matakuliah_id_unique" UNIQUE("mahasiswa_id","dosen_id","matakuliah_id")
);
--> statement-breakpoint
CREATE TABLE "matakuliah" (
	"id" serial PRIMARY KEY,
	"nama" varchar(100) NOT NULL,
	"kode" varchar(20) NOT NULL UNIQUE,
	"sks" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "materi" (
	"id" serial PRIMARY KEY,
	"matakuliah_id" integer,
	"judul" varchar(200) NOT NULL,
	"tipe" varchar(50) DEFAULT 'PDF',
	"deskripsi" text,
	"tanggal" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nilai" (
	"id" serial PRIMARY KEY,
	"mahasiswa_nama" varchar(150) NOT NULL,
	"tugas_id" integer,
	"matakuliah_id" integer,
	"nilai" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"session_key" varchar(200) PRIMARY KEY,
	"code" varchar(12) NOT NULL,
	"name" varchar(150),
	"verified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pengumuman" (
	"id" serial PRIMARY KEY,
	"judul" varchar(200) NOT NULL,
	"isi" text NOT NULL,
	"tanggal" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tugas" (
	"id" serial PRIMARY KEY,
	"matakuliah_id" integer,
	"judul" varchar(200) NOT NULL,
	"deadline" date,
	"deskripsi" text,
	"status" varchar(50) DEFAULT 'Belum dikumpulkan',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tugas_pengumpulan" (
	"id" serial PRIMARY KEY,
	"tugas_id" integer NOT NULL,
	"mahasiswa_id" integer,
	"mahasiswa_nama" varchar(150) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_path" varchar(255),
	"catatan" text,
	"tanggal" date,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tugas_pengumpulan_tugas_id_mahasiswa_id_unique" UNIQUE("tugas_id","mahasiswa_id")
);
--> statement-breakpoint
ALTER TABLE "mahasiswa_dosen" ADD CONSTRAINT "mahasiswa_dosen_mahasiswa_id_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "mahasiswa"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mahasiswa_dosen" ADD CONSTRAINT "mahasiswa_dosen_dosen_id_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "dosen"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mahasiswa_dosen" ADD CONSTRAINT "mahasiswa_dosen_matakuliah_id_matakuliah_id_fkey" FOREIGN KEY ("matakuliah_id") REFERENCES "matakuliah"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "materi" ADD CONSTRAINT "materi_matakuliah_id_matakuliah_id_fkey" FOREIGN KEY ("matakuliah_id") REFERENCES "matakuliah"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "nilai" ADD CONSTRAINT "nilai_tugas_id_tugas_id_fkey" FOREIGN KEY ("tugas_id") REFERENCES "tugas"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "nilai" ADD CONSTRAINT "nilai_matakuliah_id_matakuliah_id_fkey" FOREIGN KEY ("matakuliah_id") REFERENCES "matakuliah"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tugas" ADD CONSTRAINT "tugas_matakuliah_id_matakuliah_id_fkey" FOREIGN KEY ("matakuliah_id") REFERENCES "matakuliah"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tugas_pengumpulan" ADD CONSTRAINT "tugas_pengumpulan_tugas_id_tugas_id_fkey" FOREIGN KEY ("tugas_id") REFERENCES "tugas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tugas_pengumpulan" ADD CONSTRAINT "tugas_pengumpulan_mahasiswa_id_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "mahasiswa"("id") ON DELETE SET NULL;