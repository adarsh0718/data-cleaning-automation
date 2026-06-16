import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

def generate_dirty_dataset():
    np.random.seed(101)
    random.seed(101)
    
    start_date = datetime(2025, 1, 1)
    num_rows = 150
    
    # Base columns
    reps = ["Ravi", "kiran", "Arun  ", "PRIYA", "Deepa", "  Ravi"]
    categories = ["Electronics", "Office Supplies", "Furniture", "electronics", "OFFICE SUPPLIES", "  Furniture  "]
    products = {
        "Electronics": ["Laptop Pro", "Smart Phone X", "Wireless Buds", "LED Monitor 27"],
        "Office Supplies": ["Ergonomic Chair", "Whiteboard 4x3", "Metal Organizer", "Gel Pen Pack"],
        "Furniture": ["Standing Desk", "Bookshelf Wood", "Office Sofa", "Filing Cabinet"]
    }
    
    data = []
    
    for i in range(num_rows):
        rep = random.choice(reps)
        category = random.choice(categories)
        
        # Match product category
        clean_cat = category.strip().title()
        if clean_cat not in products:
            clean_cat = "Electronics"
        prod = random.choice(products[clean_cat])
        
        # Quantity (normally 1 to 10)
        quantity = random.randint(1, 10)
        
        # Price (normally 500 to 80000)
        price_map = {
            "Laptop Pro": 85000, "Smart Phone X": 45000, "Wireless Buds": 3500, "LED Monitor 27": 15000,
            "Ergonomic Chair": 18000, "Whiteboard 4x3": 4500, "Metal Organizer": 1200, "Gel Pen Pack": 350,
            "Standing Desk": 24000, "Bookshelf Wood": 8500, "Office Sofa": 32000, "Filing Cabinet": 6500
        }
        unit_price = price_map[prod]
        
        # 1. Inconsistent Date Formats
        dt = start_date + timedelta(days=random.randint(0, 150))
        date_format = random.choice([
            "%Y-%m-%d",      # 2025-02-14
            "%d/%m/%Y",      # 14/02/2025
            "%d-%m-%Y",      # 14-02-2025
            "%Y/%m/%d",      # 2025/02/14
            "%B %d, %Y"      # February 14, 2025
        ])
        date_str = dt.strftime(date_format)
        
        # 2. Add Null Values randomly (approx 8% null rate per column)
        if random.random() < 0.08:
            date_str = None
        if random.random() < 0.08:
            rep = ""
        if random.random() < 0.08:
            category = np.nan
        if random.random() < 0.08:
            prod = "None"
            
        unit_price_val = float(unit_price)
        if random.random() < 0.08:
            unit_price_val = None
            
        quantity_val = float(quantity)
        if random.random() < 0.08:
            quantity_val = np.nan
            
        # Revenue calculation (with potential null values)
        if unit_price_val is not None and not np.isnan(quantity_val):
            revenue = unit_price_val * quantity_val
        else:
            revenue = None
            
        # 3. Add Outliers
        if random.random() < 0.04:
            # Huge Price Outlier
            unit_price_val = 999999.0
            if quantity_val is not None and not np.isnan(quantity_val):
                revenue = unit_price_val * quantity_val
        if random.random() < 0.04:
            # Huge Quantity Outlier
            quantity_val = 5000.0
            if unit_price_val is not None:
                revenue = unit_price_val * quantity_val
                
        data.append({
            "Transaction_ID": 10000 + i,
            "Date": date_str,
            "Sales_Rep": rep,
            "Category": category,
            "Product": prod,
            "Quantity": quantity_val,
            "Unit_Price_INR": unit_price_val,
            "Total_Revenue_INR": revenue
        })
        
    df = pd.DataFrame(data)
    
    # 4. Insert Exact Duplicate Rows (duplicate about 12 rows)
    dup_indices = random.sample(range(num_rows), 12)
    duplicates = df.iloc[dup_indices].copy()
    # Shift IDs just slightly or keep them identical to test deduplication
    df = pd.concat([df, duplicates], ignore_index=True)
    
    # 5. Insert Fuzzy Duplicate Rows (same content, slightly different casings/spaces)
    fuzzy_dup = df.iloc[5].copy()
    fuzzy_dup['Sales_Rep'] = "ravi  "
    fuzzy_dup['Category'] = "ELECTRONICS"
    df = pd.concat([df, pd.DataFrame([fuzzy_dup])], ignore_index=True)
    
    # Save to file
    df.to_csv("data/dirty_dataset.csv", index=False)
    print(f"Generated {len(df)} rows of dirty data in data/dirty_dataset.csv")

if __name__ == "__main__":
    generate_dirty_dataset()
