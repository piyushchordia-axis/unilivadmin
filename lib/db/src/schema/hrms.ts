import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  pgEnum,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const employeeStatusEnum = pgEnum("employee_status", [
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
  "EXITED",
]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "WFH",
  "ON_LEAVE",
]);
export const leaveTypeEnum = pgEnum("leave_type", [
  "CL",
  "SL",
  "EL",
  "PL",
  "COMP_OFF",
]);
export const leaveStatusEnum = pgEnum("leave_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const employeesTable = pgTable("employees", {
  id: text("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  dob: timestamp("dob"),
  gender: text("gender"),
  photo: text("photo"),
  department: text("department").notNull(),
  designation: text("designation").notNull(),
  propertyId: text("property_id"),
  managerId: text("manager_id"),
  joiningDate: timestamp("joining_date").notNull(),
  ctc: numeric("ctc"),
  basic: numeric("basic"),
  hra: numeric("hra"),
  specialAllowance: numeric("special_allowance"),
  bankAccount: text("bank_account"),
  ifscCode: text("ifsc_code"),
  panNumber: text("pan_number"),
  pfNumber: text("pf_number"),
  esicNumber: text("esic_number"),
  status: employeeStatusEnum("status").default("ACTIVE").notNull(),
  exitedAt: timestamp("exited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leaveBalancesTable = pgTable("leave_balances", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  year: integer("year").notNull(),
  type: leaveTypeEnum("type").notNull(),
  total: doublePrecision("total").notNull(),
  used: doublePrecision("used").default(0).notNull(),
});

export const performanceNotesTable = pgTable("performance_notes", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(),
  text: text("text").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  addedBy: text("added_by"),
});

export const interviewsTable = pgTable("interviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  panel: text("panel"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const offersTable = pgTable("offers", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  ctc: numeric("ctc").notNull(),
  joiningDate: timestamp("joining_date").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const exitsTable = pgTable("exits", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  exitType: text("exit_type").notNull(),
  exitDate: timestamp("exit_date").notNull(),
  reason: text("reason"),
  status: text("status").default("IN_PROGRESS").notNull(),
  finalSettlement: numeric("final_settlement"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exitClearancesTable = pgTable("exit_clearances", {
  id: text("id").primaryKey(),
  exitId: text("exit_id").notNull().references(() => exitsTable.id),
  department: text("department").notNull(),
  status: text("status").default("PENDING").notNull(),
  clearedBy: text("cleared_by"),
  clearedAt: timestamp("cleared_at"),
});

export const exitAssetsTable = pgTable("exit_assets", {
  id: text("id").primaryKey(),
  exitId: text("exit_id").notNull().references(() => exitsTable.id),
  asset: text("asset").notNull(),
  returned: boolean("returned").default(false).notNull(),
});

export const attendanceTable = pgTable("attendance", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  date: timestamp("date").notNull(),
  status: attendanceStatusEnum("status").notNull(),
  inTime: timestamp("in_time"),
  outTime: timestamp("out_time"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leavesTable = pgTable("leaves", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  type: leaveTypeEnum("type").notNull(),
  fromDate: timestamp("from_date").notNull(),
  toDate: timestamp("to_date").notNull(),
  days: doublePrecision("days").notNull(),
  reason: text("reason").notNull(),
  status: leaveStatusEnum("status").default("PENDING").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobRequisitionsTable = pgTable("job_requisitions", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  department: text("department").notNull(),
  headcount: integer("headcount").notNull(),
  status: text("status").default("OPEN").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const candidatesTable = pgTable("candidates", {
  id: text("id").primaryKey(),
  jobRequisitionId: text("job_requisition_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  resumeUrl: text("resume_url"),
  source: text("source"),
  stage: text("stage").default("APPLIED").notNull(),
  bgvStatus: text("bgv_status"),
  offerStatus: text("offer_status"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = typeof employeesTable.$inferInsert;
export type Attendance = typeof attendanceTable.$inferSelect;
export type InsertAttendance = typeof attendanceTable.$inferInsert;
export type Leave = typeof leavesTable.$inferSelect;
export type InsertLeave = typeof leavesTable.$inferInsert;
export type JobRequisition = typeof jobRequisitionsTable.$inferSelect;
export type Candidate = typeof candidatesTable.$inferSelect;
export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
export type PerformanceNote = typeof performanceNotesTable.$inferSelect;
export type Interview = typeof interviewsTable.$inferSelect;
export type Offer = typeof offersTable.$inferSelect;
export type Exit = typeof exitsTable.$inferSelect;
export type ExitClearance = typeof exitClearancesTable.$inferSelect;
export type ExitAsset = typeof exitAssetsTable.$inferSelect;
