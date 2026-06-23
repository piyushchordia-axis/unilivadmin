# Persona: Unit Lead — Channel: Web App

> Parsed from the handwritten notebook **"Persona Unit Lead.pdf"** (11 scanned pages, image-only — no text layer). Pages were photographed out of order and a few were duplicated; the user stories below are reassembled in their original numbered sequence (1–47). Wording is transcribed faithfully; obvious shorthand is lightly normalised for readability.

## Requirements (User Stories)

1. As a **Unit Lead**, I should be able to **login** to the **Web App**.

2. I should be able to enter my **Username & Password** for login.

3. On validation of my **Username & Password**, I should be able to get an **OTP** on my registered mobile number.

4. I should be able to **validate the mobile OTP**.

5. In case I am unable to get a mobile OTP, I should be able to **re-generate it** (at least 3 times — parameterised).

6. In case I am unable to enter the correct OTP, I should be able to enter the **OTP at least 3 times** (configurable).

7. I should be able to **retrieve my forgotten username** by entering my registered mobile no. & an OTP sent on my mobile.

8. I should be able to **retrieve my forgotten password** by entering my registered mobile no. & an OTP sent on my mobile number.

9. On successful validation of the mobile OTP, after entering Username & Password, I should be able to **land on my home dashboard**.

10. I should be able to view a **persona-driven dashboard** which will give me access to the functionalities enabled for me.
    *(Admin user will provide federated access to users.)*

11. I should be able to view the **cut-off time** for placing the food orders.

12. I should be able to **manually select the number of persons** for which I am ordering food.

13. I should be able to view the **menu applicable for my property**.

14. I should be able to **download the menu** as an image or a PDF.

15. I should be able to **share the food menu** with any of the active guests at my property.

16. I should be able to **place an order for food** for the number of people that I have selected / entered manually earlier (orders will be done for Breakfast, Lunch, High Tea & Dinner together).

17. I should be able to receive **push notifications** on my Web App on successful order placement.

18. I should be able to receive **notification of food order placement** on my registered email ID, with the order ID.

19. I should be able to **click on the order ID** to view the status of the order.

20. I should be able to independently **view all orders** placed / cancelled / delivered with their details like date, time, etc.

21. I should be able to **enter the order ID & track the status** of an order.

22. I should be able to **receive notifications** (push on web app & email on registered official email ID) once the order is **accepted, rejected, dispatched, and delivered**.

23. I should be able to **receive details via email** for the number of items dispatched, with their item-wise quantity.

    | Item | No. |
    | --- | --- |
    | Chapati | 200 |
    | Rice | 40 kgs |
    | Toor Dal | 60 kgs |
    | Paneer Bhurji | 100 kgs |
    | Salad | 45 kgs |

24. I should be able to **view the details of a dispatched order**:
    1. Order ID
    2. Dispatch Date
    3. Order Type (e.g. Breakfast)
    4. Dispatch Time (24-hour clock format)
    5. Dispatch Date (DD/MM/YYYY format)
    6. Dispatched from (Kitchen ID, Kitchen Location, Kitchen Address with PINCODE)
    7. Dispatch VAN No. — e.g. (DL 1CA 2401)
    8. Estimated Arrival Time — e.g. (~2 hrs)
    9. VAN Driver Details (Name, Mobile)

25. I should be able to **confirm items received** with their quantity.

    | Item | No. |
    | --- | --- |
    | Chapati | 190 |
    | Rice | 40 kgs |
    | Toor Dal | 60 kgs |
    | Paneer Bhurji | 95 kgs |
    | Salad | 44 kgs |

26. I should be able to **view the difference in items & quantity ordered vs delivered** for an order type, in an order ID, in a tabular format with Item, Quantity Ordered vs Delivered.

27. In any order ID, I should be able to see **four (configurable) different order types**, namely:
    - a) Breakfast
    - b) Lunch
    - c) High Tea / Evening Snacks
    - d) Dinner

28. I should be able to **record wastage of food** against an order ID (only within one hour of delivery time).

    | Item | Ordered Quantity | Delivered | Wasted | Measurement in |
    | --- | --- | --- | --- | --- |
    | Chapati | 200 | 200 | 80 | Absolute |
    | Toor Dal | 60 | 60 | 20 | Kgs |
    | Paneer Bhurji | 100 | 100 | 5 | Kgs |

29. I should be able to **cancel an order (ID)** until the status has not become "dispatched".

30. I should be able to **edit an order (ID)** until the status has not become "dispatched".

31. The amount of **wastage recorded cannot be more than the quantity** of the dish ordered.

32. **Dashboards** should be visible for orders done per day, meal-type distribution, resident trends, etc.

33. **Show dashboards** (charts / bar graphs):
    - where comparison of no. of people for which order is done is present (filters of Week / Month / Qtr / Year, etc.)
    - show comparison of total wastage on day / week / Month / Qtr / annual basis (FY)
    - show top 20% items where wastage is highest on a monthly / Qtr / annual basis (FY)
    - show active resident trends on monthly / Qtrly / annual basis (FY)
    - show no. of times food order was delayed (weekly / monthly / Qtrly / annual basis, FY)

34. I should be able to **generate reports in .xls & PDF format** for all the dashboards visible to me.

35. I should be able to view a **bell icon** on my home screen.

36. **All my notifications** should be part of my bell icon.

37. I should be able to see **today's date, time & day**.

38. I should have an option to **view my app in Light mode & Dark mode**.

39. I should be able to see **my name with the greeting** as per the time of day on my home dashboard.

40. I should be able to **logout** from my session.

41. I should be able to **view my designation** with my name as a user.

42. I should be able to view the **Property ID / Property Name & Property Address** of the property I manage.

43. I should be able to view **total active guests** in my property.

44. I should be able to see **total / max occupancy allowed** in my property.

45. I should be able to **view the list of active guests** in my property.
    *E.g.* Guest ID / Guest Name / Mobile No / Room No / Property ID / Gender / Guest Since

46. I should be able to **perform a global search** on my guests, basis Name / PAN / Aadhaar / Mobile No / Room No, etc.

47. <a id="dup-46"></a>I should be able to **download the active guest list** in .xls & PDF format.
    > *Note: this story was hand-numbered **46** in the source (the number 46 appears twice). It is shown here as 47 to keep the list sequential.*

48. I should be able to **view monthly revenue** being generated at my property.
    > *Note: hand-numbered **47** in the source; renumbered to 48 due to the duplicate 46 above.*

---

### Source / parsing notes
- **Source:** `Persona Unit Lead.pdf` — 11 image-only pages (handwritten notebook, "YOUVA" ruled paper).
- **Page → story mapping (PDF page order is reversed):** p11 → title + 1–8 · p7/p10 → 9–14 · p8 → 15–21 · p6/p9 → 22–24 · p5 → 25–27 (+ story 24 sub-points 7–9) · p4 → 28–32 · p3 → 33–35 · p2 → 36–43 · p1 → 44–47.
- **Duplicate scans:** PDF pages 9 and 10 repeat pages 6 and 7.
- **Numbering quirk:** the author numbered two consecutive stories "46"; the final story was numbered "47". They are renumbered 46 / 47 / 48 here so the sequence is unique, with notes preserving the original numbers.
