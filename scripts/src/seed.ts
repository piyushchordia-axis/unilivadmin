import { db } from "@workspace/db";
import {
  usersTable,
  propertiesTable,
  roomsTable,
  residentsTable,
  complaintsTable,
  employeesTable,
  vendorsTable,
  leadsTable,
  coursesTable,
  propertyLeadsTable,
  inventoryTable,
  announcementsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

function id() {
  return randomUUID();
}

async function main() {
  console.log("Seeding database...");

  // Admin user
  const adminId = id();
  const adminHash = await bcrypt.hash("Admin@123", 12);
  await db
    .insert(usersTable)
    .values({
      id: adminId,
      name: "Super Admin",
      email: "admin@uniliv.com",
      passwordHash: adminHash,
      role: "SUPER_ADMIN",
      isActive: true,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  const opsId = id();
  const opsHash = await bcrypt.hash("Ops@1234", 12);
  await db
    .insert(usersTable)
    .values({
      id: opsId,
      name: "Priya Sharma",
      email: "priya@uniliv.com",
      passwordHash: opsHash,
      role: "OPERATIONS_MANAGER",
      isActive: true,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // Properties
  const prop1Id = id();
  const prop2Id = id();
  const prop3Id = id();
  await db
    .insert(propertiesTable)
    .values([
      {
        id: prop1Id,
        name: "UNILIV Koramangala",
        address: "14, 5th Block, Koramangala",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560034",
        totalBeds: 120,
        status: "ACTIVE",
        phone: "9876543210",
        email: "koramangala@uniliv.com",
        amenities: ["WiFi", "Laundry", "Gym", "Cafeteria", "CCTV"],
        updatedAt: new Date(),
      },
      {
        id: prop2Id,
        name: "UNILIV Whitefield",
        address: "23, ITPL Main Road, Whitefield",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560066",
        totalBeds: 80,
        status: "ACTIVE",
        phone: "9876543211",
        email: "whitefield@uniliv.com",
        amenities: ["WiFi", "Laundry", "AC Rooms", "Study Lounge"],
        updatedAt: new Date(),
      },
      {
        id: prop3Id,
        name: "UNILIV Baner",
        address: "7, Baner Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411045",
        totalBeds: 60,
        status: "ACTIVE",
        phone: "9876543212",
        email: "baner@uniliv.com",
        amenities: ["WiFi", "Laundry", "Gym"],
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Rooms
  const roomIds: string[] = [];
  const rooms = [];
  for (let i = 1; i <= 10; i++) {
    const rId = id();
    roomIds.push(rId);
    rooms.push({
      id: rId,
      propertyId: i <= 5 ? prop1Id : i <= 8 ? prop2Id : prop3Id,
      number: `${Math.ceil(i / 4)}0${i}`,
      floor: Math.ceil(i / 4),
      wing: i % 2 === 0 ? "A" : "B",
      type: (["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY"][i % 4] as "SINGLE" | "DOUBLE" | "TRIPLE" | "DORMITORY"),
      capacity: [1, 2, 3, 6][i % 4]!,
      status: (i <= 7 ? "OCCUPIED" : i === 8 ? "MAINTENANCE" : "VACANT") as "OCCUPIED" | "MAINTENANCE" | "VACANT",
      updatedAt: new Date(),
    });
  }
  await db.insert(roomsTable).values(rooms).onConflictDoNothing();

  // Residents
  const residentData = [
    { name: "Arjun Mehta", email: "arjun@example.com", phone: "9811122233", propId: prop1Id, roomId: roomIds[0]! },
    { name: "Sneha Rao", email: "sneha@example.com", phone: "9811122244", propId: prop1Id, roomId: roomIds[1]! },
    { name: "Karan Singh", email: "karan@example.com", phone: "9811122255", propId: prop1Id, roomId: roomIds[2]! },
    { name: "Divya Nair", email: "divya@example.com", phone: "9811122266", propId: prop2Id, roomId: roomIds[3]! },
    { name: "Rahul Gupta", email: "rahul@example.com", phone: "9811122277", propId: prop2Id, roomId: roomIds[4]! },
    { name: "Priya Patel", email: "priya.p@example.com", phone: "9811122288", propId: prop3Id, roomId: roomIds[5]! },
  ];

  for (const r of residentData) {
    await db
      .insert(residentsTable)
      .values({
        id: id(),
        propertyId: r.propId,
        roomId: r.roomId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        gender: "Male",
        college: "IIT Bengaluru",
        course: "B.Tech CS",
        checkInDate: new Date("2024-07-01"),
        monthlyRent: "15000",
        securityDeposit: "30000",
        status: "ACTIVE",
        dietaryPref: ["Vegetarian"],
        allergies: [],
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Complaints
  const complaints = [
    { propId: prop1Id, cat: "ELECTRICAL" as const, title: "Power outage in room 101", priority: "HIGH" as const, status: "OPEN" as const },
    { propId: prop1Id, cat: "PLUMBING" as const, title: "Leaking tap in washroom", priority: "MEDIUM" as const, status: "ASSIGNED" as const },
    { propId: prop2Id, cat: "INTERNET" as const, title: "WiFi not working on 2nd floor", priority: "HIGH" as const, status: "IN_PROGRESS" as const },
    { propId: prop2Id, cat: "HOUSEKEEPING" as const, title: "Common area not cleaned", priority: "LOW" as const, status: "RESOLVED" as const },
    { propId: prop3Id, cat: "SECURITY" as const, title: "Main gate lock broken", priority: "CRITICAL" as const, status: "OPEN" as const },
    { propId: prop1Id, cat: "FOOD" as const, title: "Quality of dinner poor", priority: "MEDIUM" as const, status: "CLOSED" as const },
  ];

  let ticketNum = 10001;
  for (const c of complaints) {
    await db
      .insert(complaintsTable)
      .values({
        id: id(),
        propertyId: c.propId,
        ticketNo: `TKT-${ticketNum++}`,
        category: c.cat,
        title: c.title,
        description: `Resident reported: ${c.title}. Please investigate and resolve at the earliest.`,
        priority: c.priority,
        status: c.status,
        slaHours: 24,
        slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        slaBreach: c.priority === "CRITICAL",
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Employees
  const departments = ["Operations", "Housekeeping", "Kitchen", "Security", "HR", "Finance"];
  const empData = [
    { name: "Vikram Bose", email: "vikram@uniliv.com", dept: "Operations", desig: "Operations Head" },
    { name: "Lakshmi Iyer", email: "lakshmi@uniliv.com", dept: "HR", desig: "HR Manager" },
    { name: "Suresh Kumar", email: "suresh@uniliv.com", dept: "Housekeeping", desig: "Housekeeping Lead" },
    { name: "Anita Desai", email: "anita@uniliv.com", dept: "Kitchen", desig: "Chef" },
    { name: "Mohan Pillai", email: "mohan@uniliv.com", dept: "Security", desig: "Security Guard" },
    { name: "Ravi Shankar", email: "ravi@uniliv.com", dept: "Finance", desig: "Finance Executive" },
  ];

  let empNum = 1001;
  for (const e of empData) {
    await db
      .insert(employeesTable)
      .values({
        id: id(),
        employeeCode: `EMP-${empNum++}`,
        name: e.name,
        email: e.email,
        phone: `98${Math.floor(Math.random() * 100000000).toString().padStart(8, "0")}`,
        department: e.dept,
        designation: e.desig,
        propertyId: prop1Id,
        joiningDate: new Date("2023-01-15"),
        ctc: "480000",
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Vendors
  const vendorData = [
    { name: "Reliance Fresh Supplies", cats: ["Groceries", "Vegetables"], phone: "9900112233" },
    { name: "CleanCo Housekeeping", cats: ["Housekeeping", "Laundry"], phone: "9900112244" },
    { name: "TechNet ISP", cats: ["Internet", "IT"], phone: "9900112255" },
    { name: "SafeGuard Security", cats: ["Security"], phone: "9900112266" },
  ];
  for (const v of vendorData) {
    await db
      .insert(vendorsTable)
      .values({
        id: id(),
        name: v.name,
        phone: v.phone,
        categories: v.cats,
        rating: 4.2,
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Leads
  const leadData = [
    { name: "Ananya Krishnan", phone: "9800012301", source: "INSTAGRAM" as const, stage: "NEW" as const, propId: prop1Id },
    { name: "Dev Malhotra", phone: "9800012302", source: "WEBSITE" as const, stage: "CONTACTED" as const, propId: prop1Id },
    { name: "Sunita Joshi", phone: "9800012303", source: "REFERRAL" as const, stage: "VISIT_DONE" as const, propId: prop2Id },
    { name: "Rohan Verma", phone: "9800012304", source: "COLLEGE" as const, stage: "CONVERTED" as const, propId: prop2Id },
    { name: "Kavya Nambiar", phone: "9800012305", source: "WHATSAPP" as const, stage: "NEGOTIATING" as const, propId: prop3Id },
  ];
  for (const l of leadData) {
    await db
      .insert(leadsTable)
      .values({
        id: id(),
        name: l.name,
        phone: l.phone,
        source: l.source,
        stage: l.stage,
        propertyId: l.propId,
        visitDone: l.stage !== "NEW" && l.stage !== "CONTACTED",
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Courses
  await db
    .insert(coursesTable)
    .values([
      {
        id: id(),
        title: "Fire Safety & Evacuation",
        description: "Mandatory fire safety training for all staff",
        category: "Safety",
        contentType: "VIDEO",
        isMandatory: true,
        isActive: true,
        targetRoles: ["WARDEN", "OPERATIONS_MANAGER"],
        updatedAt: new Date(),
      },
      {
        id: id(),
        title: "Customer Service Excellence",
        description: "Best practices for resident interaction",
        category: "Soft Skills",
        contentType: "DOCUMENT",
        isMandatory: false,
        isActive: true,
        targetRoles: ["WARDEN"],
        updatedAt: new Date(),
      },
      {
        id: id(),
        title: "Food Safety & Hygiene",
        description: "FSSAI compliance and kitchen hygiene",
        category: "Compliance",
        contentType: "VIDEO",
        isMandatory: true,
        isActive: true,
        targetRoles: ["KITCHEN_MANAGER"],
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Property leads (acquisition pipeline)
  await db
    .insert(propertyLeadsTable)
    .values([
      {
        id: id(),
        name: "Brigade Residency, Indiranagar",
        address: "45 Indiranagar Main Road",
        city: "Bengaluru",
        ownerName: "Mr. Ramesh Hegde",
        ownerPhone: "9988776655",
        bedCount: 100,
        askingRent: "85000",
        stage: "SCOUTING",
        documents: [],
        photos: [],
        updatedAt: new Date(),
      },
      {
        id: id(),
        name: "Adarsh Apartments, HSR Layout",
        address: "12, HSR Layout Sector 4",
        city: "Bengaluru",
        ownerName: "Ms. Veena Murthy",
        ownerPhone: "9988776644",
        bedCount: 60,
        askingRent: "55000",
        stage: "SITE_VISIT",
        documents: [],
        photos: [],
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Inventory
  await db
    .insert(inventoryTable)
    .values([
      {
        id: id(),
        propertyId: prop1Id,
        name: "Rice (Basmati 25kg)",
        category: "Groceries",
        unit: "Bags",
        currentStock: "3",
        minStock: "5",
        unitCost: "1800",
        isAsset: false,
        updatedAt: new Date(),
      },
      {
        id: id(),
        propertyId: prop1Id,
        name: "Bed Linen Set",
        category: "Housekeeping",
        unit: "Sets",
        currentStock: "45",
        minStock: "20",
        unitCost: "850",
        isAsset: false,
        updatedAt: new Date(),
      },
      {
        id: id(),
        propertyId: prop1Id,
        name: "CCTV Camera",
        category: "Security",
        unit: "Units",
        currentStock: "16",
        minStock: "16",
        unitCost: "8500",
        isAsset: true,
        assetTag: "CCTV-001",
        condition: "GOOD",
        updatedAt: new Date(),
      },
      {
        id: id(),
        propertyId: prop1Id,
        name: "Hand Soap (1L)",
        category: "Consumables",
        unit: "Bottles",
        currentStock: "8",
        minStock: "20",
        unitCost: "120",
        isAsset: false,
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Announcement
  await db
    .insert(announcementsTable)
    .values({
      id: id(),
      title: "Maintenance Scheduled: 5th May 2026",
      content:
        "Routine maintenance of water heaters and electrical wiring will be carried out on 5th May from 10 AM to 2 PM. We apologize for the inconvenience.",
      propertyId: prop1Id,
      targetRoles: ["WARDEN", "OPERATIONS_MANAGER"],
      createdBy: adminId,
    })
    .onConflictDoNothing();

  console.log("Seed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
