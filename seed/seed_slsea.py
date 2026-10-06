#!/usr/bin/env python3
"""
SLSEA seed generator + uploader.

ID conventions:
    province_id     numeric
    district_id     numeric
    substation_id   numeric
    installation_id short string: INS-000001
    meter_id        string: SLM-10000001
    reading_id      numeric
    user_id         is not seeded by this script

The script generates the seed data in memory, validates it, and optionally uploads
it directly to MongoDB. It never touches the users collection.

Examples:

    python seed_slsea.py --dry-run

    python seed_slsea.py \
        --uri "mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/slsea"

    python seed_slsea.py \
        --uri "mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/slsea" \
        --drop
"""

import argparse
import base64
import hashlib
import math
import os
import random
import secrets
import sys
from datetime import datetime, timedelta, timezone

try:
    from pymongo import ASCENDING, MongoClient
except ImportError:
    sys.exit("pymongo is missing — run: python -m pip install pymongo")


# ---------------------------------------------------------------------------------------------
# Fixed reference data
# ---------------------------------------------------------------------------------------------

PROVINCES = [
    (1, "Western"),
    (2, "Central"),
    (3, "Southern"),
    (4, "Northern"),
    (5, "Eastern"),
    (6, "North Western"),
    (7, "North Central"),
    (8, "Uva"),
    (9, "Sabaragamuwa"),
]

# district_id, name, province_id, installation count, substation names
DISTRICTS = [
    (1, "Colombo", 1, 27, ["Kolonnawa", "Pannipitiya", "Dehiwala"]),
    (2, "Gampaha", 1, 24, ["Kotugoda", "Biyagama"]),
    (3, "Kalutara", 1, 12, ["Panadura", "Horana"]),
    (4, "Kandy", 2, 16, ["Kiribathkumbura", "Peradeniya"]),
    (5, "Matale", 2, 6, ["Ukuwela", "Dambulla"]),
    (6, "Nuwara Eliya", 2, 6, ["Nuwara Eliya", "Hatton"]),
    (7, "Galle", 3, 12, ["Galle", "Ambalangoda"]),
    (8, "Matara", 3, 9, ["Matara", "Akuressa"]),
    (9, "Hambantota", 3, 8, ["Hambantota", "Tissamaharama"]),
    (10, "Jaffna", 4, 8, ["Chunnakam"]),
    (11, "Kilinochchi", 4, 4, ["Kilinochchi"]),
    (12, "Mannar", 4, 4, ["Mannar"]),
    (13, "Vavuniya", 4, 4, ["Vavuniya"]),
    (14, "Mullaitivu", 4, 4, ["Mullaitivu"]),
    (15, "Batticaloa", 5, 7, ["Valaichchenai"]),
    (16, "Ampara", 5, 8, ["Ampara", "Kalmunai"]),
    (17, "Trincomalee", 5, 6, ["Trincomalee"]),
    (18, "Kurunegala", 6, 18, ["Kurunegala", "Kuliyapitiya"]),
    (19, "Puttalam", 6, 9, ["Puttalam", "Chilaw"]),
    (20, "Anuradhapura", 7, 10, ["Anuradhapura", "Habarana"]),
    (21, "Polonnaruwa", 7, 6, ["Polonnaruwa"]),
    (22, "Badulla", 8, 8, ["Badulla", "Bandarawela"]),
    (23, "Monaragala", 8, 5, ["Monaragala"]),
    (24, "Ratnapura", 9, 11, ["Ratnapura", "Balangoda", "Embilipitiya"]),
    (25, "Kegalle", 9, 8, ["Kegalle"]),
]

EDGE_DISTRICTS = (1, 4)  # Colombo and Kandy
EDGE_KINDS = ("never_reported", "silent", "decommissioned")

SLOT = timedelta(minutes=15)
SLOTS = 7 * 24 * 4
SILENT_STOP = 6 * 4
DECOM_STOP = 3 * 24 * 4
SL_OFFSET = timedelta(hours=5, minutes=30)

CAPACITIES = [
    (1.5, 10),
    (3.0, 30),
    (5.0, 35),
    (10.0, 20),
    (20.0, 5),
]

RNG_SEED = 20261006


# ---------------------------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------------------------

def utc_now():
    return datetime.now(timezone.utc)


def floor_15(value):
    value = value.replace(second=0, microsecond=0)
    return value - timedelta(minutes=value.minute % 15)


def milliseconds(value):
    """MongoDB stores dates to millisecond precision."""
    return value.replace(microsecond=(value.microsecond // 1000) * 1000)


def new_installation_id(sequence):
    return f"INS-{sequence:06d}"


def new_secret():
    raw = secrets.token_bytes(32)
    text = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return text, digest


# ---------------------------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------------------------

def generate(end):
    rng = random.Random(RNG_SEED)
    seed_time = milliseconds(utc_now())

    provinces = [
        {
            "province_id": province_id,
            "name": name,
            "updated_at": seed_time,
        }
        for province_id, name in PROVINCES
    ]

    districts = []
    substations = []
    sub_by_district = {}

    next_substation_id = 1

    for district_id, name, province_id, _count, substation_names in DISTRICTS:
        districts.append(
            {
                "district_id": district_id,
                "name": name,
                "province_id": province_id,
                "updated_at": seed_time,
            }
        )

        sub_by_district[district_id] = []

        for substation_name in substation_names:
            substation_id = next_substation_id
            next_substation_id += 1

            substations.append(
                {
                    "substation_id": substation_id,
                    "name": substation_name,
                    "district_id": district_id,
                    "updated_at": seed_time,
                }
            )

            sub_by_district[district_id].append(substation_id)

    installations = []
    plans = []
    credentials = []

    next_installation_number = 1
    next_meter_number = 10000001

    for district_id, _name, _province_id, count, _substation_names in DISTRICTS:
        for position in range(count):
            if district_id in EDGE_DISTRICTS and position < len(EDGE_KINDS):
                kind = EDGE_KINDS[position]
            else:
                kind = "normal"

            capacity_kw = rng.choices(
                [capacity for capacity, _weight in CAPACITIES],
                weights=[weight for _capacity, weight in CAPACITIES],
            )[0]

            installation_id = new_installation_id(next_installation_number)
            next_installation_number += 1

            installation = {
                "installation_id": installation_id,
                "meter_id": f"SLM-{next_meter_number}",
                "capacity_kw": capacity_kw,
                "status": (
                    "DECOMMISSIONED"
                    if kind == "decommissioned"
                    else "ACTIVE"
                ),
                "substation_id": sub_by_district[district_id][
                    position % len(sub_by_district[district_id])
                ],
                "device_secret_hash": None,
                "device_secret_issued_at": None,
                "created_at": seed_time,
                "updated_at": seed_time,
            }

            if kind in ("normal", "silent"):
                device_secret, device_secret_hash = new_secret()

                installation["device_secret_hash"] = device_secret_hash
                installation["device_secret_issued_at"] = seed_time

                credentials.append(
                    {
                        "installation_id": installation_id,
                        "device_secret": device_secret,
                        "district_id": district_id,
                        "meter_id": installation["meter_id"],
                        "kind": kind,
                    }
                )

            installations.append(installation)
            plans.append((installation, district_id, kind))
            next_meter_number += 1

    first_reading_time = end - (SLOTS - 1) * SLOT
    weather = {}

    def day_factor(district_id, local_day):
        key = (district_id, local_day)

        if key not in weather:
            weather[key] = rng.uniform(0.45, 1.0)

        return weather[key]

    readings = []
    next_reading_id = 1

    for installation, district_id, kind in plans:
        if kind == "never_reported":
            continue

        if kind == "silent":
            reading_count = SLOTS - SILENT_STOP
        elif kind == "decommissioned":
            reading_count = SLOTS - DECOM_STOP
        else:
            reading_count = SLOTS

        energy_kwh = rng.uniform(500, 20000)
        capacity_kw = installation["capacity_kw"]
        panel_efficiency = rng.uniform(0.88, 1.0)

        for index in range(reading_count):
            recorded_at = first_reading_time + index * SLOT
            local_time = recorded_at + SL_OFFSET
            minutes = local_time.hour * 60 + local_time.minute

            if 6 * 60 + 15 <= minutes <= 18 * 60:
                daylight_position = (minutes - 6 * 60) / (12 * 60)

                power = (
                    capacity_kw
                    * 0.92
                    * panel_efficiency
                    * day_factor(district_id, local_time.date())
                    * math.sin(math.pi * daylight_position) ** 1.3
                )

                power *= rng.uniform(0.92, 1.05)
                power_kw = round(min(max(power, 0.0), capacity_kw), 3)
            else:
                power_kw = 0.0

            energy_kwh += power_kw * 0.25

            readings.append(
                {
                    "reading_id": next_reading_id,
                    "installation_id": installation["installation_id"],
                    "recorded_at": recorded_at,
                    "received_at": recorded_at
                    + timedelta(seconds=rng.randint(5, 60)),
                    "power_kw": power_kw,
                    "energy_kwh": round(energy_kwh, 3),
                    "voltage": round(rng.uniform(215, 250), 1),
                }
            )

            next_reading_id += 1

    test_device = next(
        credential
        for credential in credentials
        if credential["district_id"] == 1
        and credential["kind"] == "normal"
    )

    data = {
        "provinces": provinces,
        "districts": districts,
        "substations": substations,
        "installations": installations,
        "readings": readings,
    }

    return data, credentials, test_device


# ---------------------------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------------------------

def run_checks(data):
    provinces = data["provinces"]
    districts = data["districts"]
    substations = data["substations"]
    installations = data["installations"]
    readings = data["readings"]

    province_ids = {item["province_id"] for item in provinces}
    district_ids = {item["district_id"] for item in districts}
    substation_ids = {item["substation_id"] for item in substations}
    installation_map = {
        item["installation_id"]: item
        for item in installations
    }

    substation_district = {
        item["substation_id"]: item["district_id"]
        for item in substations
    }

    readings_by_installation = {}

    for reading in readings:
        readings_by_installation.setdefault(
            reading["installation_id"], []
        ).append(reading)

    night_count = 0
    over_capacity_count = 0
    decreasing_energy_count = 0

    for installation_id, installation_readings in readings_by_installation.items():
        installation_readings.sort(
            key=lambda item: item["recorded_at"]
        )

        capacity_kw = installation_map[installation_id]["capacity_kw"]

        for previous, current in zip(
            installation_readings,
            installation_readings[1:],
        ):
            if current["energy_kwh"] < previous["energy_kwh"]:
                decreasing_energy_count += 1

        for reading in installation_readings:
            local_time = reading["recorded_at"] + SL_OFFSET
            minutes = local_time.hour * 60 + local_time.minute

            is_daylight = 6 * 60 + 15 <= minutes <= 18 * 60

            if reading["power_kw"] > 0 and not is_daylight:
                night_count += 1

            if reading["power_kw"] > capacity_kw:
                over_capacity_count += 1

    status_counts = {
        "ACTIVE": 0,
        "DECOMMISSIONED": 0,
    }

    for installation in installations:
        status_counts[installation["status"]] += 1

    credential_installations = [
        installation
        for installation in installations
        if installation["device_secret_hash"]
    ]

    invalid_credential_installations = [
        installation
        for installation in credential_installations
        if (
            installation["status"] == "DECOMMISSIONED"
            or installation["installation_id"]
            not in readings_by_installation
        )
    ]

    foreign_keys_valid = (
        all(
            district["province_id"] in province_ids
            for district in districts
        )
        and all(
            substation["district_id"] in district_ids
            for substation in substations
        )
        and all(
            installation["substation_id"] in substation_ids
            for installation in installations
        )
        and all(
            reading["installation_id"] in installation_map
            for reading in readings
        )
    )

    every_district_has_data = all(
        any(
            substation["district_id"] == district_id
            for substation in substations
        )
        and any(
            substation_district[installation["substation_id"]]
            == district_id
            for installation in installations
        )
        for district_id in district_ids
    )

    readings_per_installation = {}

    for installation_id, installation_readings in readings_by_installation.items():
        count = len(installation_readings)
        readings_per_installation[count] = (
            readings_per_installation.get(count, 0) + 1
        )

    reading_count_summary = ", ".join(
        f"{count}: {number_of_installations}"
        for count, number_of_installations
        in sorted(readings_per_installation.items())
        if count
    )

    checks = [
        (
            "provinces / districts / substations / installations",
            f"{len(provinces)} / {len(districts)} / "
            f"{len(substations)} / {len(installations)}",
            "9 / 25 / 42 / 240",
        ),
        (
            "every foreign key valid",
            "yes" if foreign_keys_valid else "NO",
            "yes",
        ),
        (
            "every district has a substation and an installation",
            "yes" if every_district_has_data else "NO",
            "yes",
        ),
        (
            "province_id unique",
            "yes"
            if len({item["province_id"] for item in provinces})
            == len(provinces)
            else "NO",
            "yes",
        ),
        (
            "district_id unique",
            "yes"
            if len({item["district_id"] for item in districts})
            == len(districts)
            else "NO",
            "yes",
        ),
        (
            "substation_id unique",
            "yes"
            if len({item["substation_id"] for item in substations})
            == len(substations)
            else "NO",
            "yes",
        ),
        (
            "installation_id unique",
            "yes"
            if len({item["installation_id"] for item in installations})
            == len(installations)
            else "NO",
            "yes",
        ),
        (
            "meter_id unique",
            "yes"
            if len({item["meter_id"] for item in installations})
            == len(installations)
            else "NO",
            "yes",
        ),
        (
            "reading_id unique",
            "yes"
            if len({item["reading_id"] for item in readings})
            == len(readings)
            else "NO",
            "yes",
        ),
        (
            "reading (installation, recorded_at) unique",
            "yes"
            if len(
                {
                    (
                        item["installation_id"],
                        item["recorded_at"],
                    )
                    for item in readings
                }
            ) == len(readings)
            else "NO",
            "yes",
        ),
        (
            "power_kw > capacity_kw",
            str(over_capacity_count),
            "0",
        ),
        (
            "power_kw > 0 at night",
            str(night_count),
            "0",
        ),
        (
            "energy decreasing within an installation",
            str(decreasing_energy_count),
            "0",
        ),
        (
            "status counts",
            f"ACTIVE {status_counts['ACTIVE']}, "
            f"DECOMMISSIONED {status_counts['DECOMMISSIONED']}",
            "ACTIVE 238, DECOMMISSIONED 2",
        ),
        (
            "installations without readings",
            str(len(installations) - len(readings_by_installation)),
            "2",
        ),
        (
            "installations with a credential",
            (
                f"{len(credential_installations)}"
                if not invalid_credential_installations
                else f"{len(credential_installations)} "
                "(WRONG ONES INCLUDED)"
            ),
            "236",
        ),
        (
            "readings per installation (count: installations)",
            reading_count_summary,
            "384: 2, 648: 2, 672: 234",
        ),
    ]

    print("\nChecks")

    width = max(len(check[0]) for check in checks)
    failed = 0

    for name, actual, expected in checks:
        passed = actual == expected

        if not passed:
            failed += 1

        suffix = "" if passed else f"   (expected {expected})"

        print(
            f"  {'PASS' if passed else 'FAIL'}  "
            f"{name.ljust(width)}  {actual}{suffix}"
        )

    print(f"\n  readings total: {len(readings):,}")

    return failed == 0


# ---------------------------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------------------------

INDEXES = {
    "provinces": [
        ([("province_id", ASCENDING)], True),
    ],
    "districts": [
        ([("district_id", ASCENDING)], True),
        ([("province_id", ASCENDING)], False),
    ],
    "substations": [
        ([("substation_id", ASCENDING)], True),
        ([("district_id", ASCENDING)], False),
    ],
    "installations": [
        ([("installation_id", ASCENDING)], True),
        ([("meter_id", ASCENDING)], True),
        ([("status", ASCENDING)], False),
        ([("substation_id", ASCENDING)], False),
    ],
    "readings": [
        ([("reading_id", ASCENDING)], True),
        (
            [
                ("installation_id", ASCENDING),
                ("recorded_at", ASCENDING),
            ],
            True,
        ),
        (
            [
                ("installation_id", ASCENDING),
                ("received_at", ASCENDING),
            ],
            False,
        ),
    ],
}

UPLOAD_ORDER = [
    "provinces",
    "districts",
    "substations",
    "installations",
    "readings",
]


def upload(database, data, drop):
    existing = {
        name: database[name].estimated_document_count()
        for name in UPLOAD_ORDER
    }

    if any(existing.values()) and not drop:
        sys.exit(
            f"Seed collections are not empty: {existing}. "
            "Re-run with --drop to replace them. "
            "The users collection is never touched."
        )

    for name in UPLOAD_ORDER:
        if drop:
            database[name].drop()

        documents = data[name]

        for start in range(0, len(documents), 5000):
            database[name].insert_many(
                documents[start:start + 5000],
                ordered=False,
            )

        for index_keys, unique in INDEXES[name]:
            database[name].create_index(
                index_keys,
                unique=unique,
            )

        count = database[name].count_documents({})

        print(
            f"  {name:<14} {count:>8,} documents"
            if count == len(documents)
            else (
                f"  {name:<14} {count:>8,} documents"
                f"   MISMATCH (expected {len(documents):,})"
            )
        )

        if count != len(documents):
            sys.exit("Upload incomplete.")


# ---------------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate and upload SLSEA seed data."
    )

    parser.add_argument(
        "--uri",
        default=os.environ.get("MONGODB_URI"),
        help="MongoDB URI; defaults to the MONGODB_URI environment variable",
    )

    parser.add_argument(
        "--db",
        default="slsea",
        help="database name if the URI has no database name",
    )

    parser.add_argument(
        "--end",
        help=(
            "end of the week as ISO 8601 UTC, "
            "for example 2026-10-20T06:00:00Z"
        ),
    )

    parser.add_argument(
        "--drop",
        action="store_true",
        help="replace the five seed collections; never users",
    )

    parser.add_argument(
        "--yes",
        action="store_true",
        help="skip the confirmation before dropping a remote database",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="generate and validate only; upload nothing",
    )

    parser.add_argument(
        "--out",
        default="seed-output",
        help="folder for private device credential files",
    )

    args = parser.parse_args()

    if args.end:
        end = datetime.fromisoformat(
            args.end.replace("Z", "+00:00")
        )
    else:
        end = utc_now()

    if end.tzinfo is None:
        sys.exit(
            "--end needs a timezone, for example "
            "2026-10-20T06:00:00Z"
        )

    end = floor_15(end.astimezone(timezone.utc))

    print(
        "Generating 7 days of readings ending "
        f"{end.isoformat()} ..."
    )

    data, credentials, test_device = generate(end)

    if not run_checks(data):
        sys.exit("\nChecks failed — nothing uploaded.")

    if args.dry_run:
        print("\nDry run: nothing uploaded, no secrets written.")
        return

    if not args.uri:
        sys.exit(
            "No database URI. Pass --uri or set MONGODB_URI."
        )

    client = MongoClient(
        args.uri,
        serverSelectionTimeoutMS=10000,
    )

    client.admin.command("ping")

    database = client.get_default_database(default=args.db)

    is_local = any(
        host in args.uri
        for host in ("localhost", "127.0.0.1")
    )

    print(
        f"\nTarget: database '{database.name}' on "
        f"{'local MongoDB' if is_local else 'a REMOTE server'}"
    )

    if args.drop and not is_local and not args.yes:
        confirmation = input(
            "Drop and reload the five seed collections there? "
            "Type 'yes': "
        ).strip()

        if confirmation != "yes":
            sys.exit("Cancelled.")

    upload(database, data, args.drop)

    os.makedirs(args.out, exist_ok=True)

    with open(
        os.path.join(args.out, "device-credentials.json"),
        "w",
        encoding="utf-8",
    ) as file:
        import json

        json.dump(
            [
                {
                    "installation_id": credential["installation_id"],
                    "device_secret": credential["device_secret"],
                }
                for credential in credentials
            ],
            file,
            indent=2,
        )

    with open(
        os.path.join(args.out, "test-device.json"),
        "w",
        encoding="utf-8",
    ) as file:
        import json

        json.dump(
            {
                "installation_id": test_device["installation_id"],
                "meter_id": test_device["meter_id"],
                "device_secret": test_device["device_secret"],
            },
            file,
            indent=2,
        )

    print(
        "\nDone. Secrets written to "
        f"{args.out}/ — keep this folder private."
    )

    print(
        f"Test device: {test_device['installation_id']}"
    )


if __name__ == "__main__":
    main()
