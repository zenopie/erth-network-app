import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Legend } from "recharts";
import "./AllocationFund.css";
import { showLoadingScreen } from "../utils/uiUtils";
import { query, contract } from "../utils/contractUtils";

// Colors for the pie chart
const COLORS = ["#4CAF50", "#8BC34A", "#FF9800", "#CDDC39", "#009688", "#795548"];
const UNALLOCATED_COLOR = "#B0B0B0"; // Grey color for Unallocated

const renderCustomLegend = (props, data) => {
  const { payload } = props;
  const total = data.reduce((acc, entry) => acc + (entry.value || 0), 0);

  return (
    <ul
      style={{
        listStyleType: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {payload.map((entry, index) => {
        const value = entry.payload.value || 0;
        const name = entry.payload.name || "N/A";
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
        const formattedPercentage = percentage.endsWith(".0") ? parseInt(percentage) : percentage;

        return (
          <li
            key={`item-${index}`}
            style={{
              margin: "0 10px",
              color: entry.color,
              whiteSpace: "nowrap",
            }}
          >
            {`${name} ${formattedPercentage}%`}
          </li>
        );
      })}
    </ul>
  );
};

const getChartDataWithUnallocated = (allocations = []) => {
  const totalPercentage = allocations.reduce((acc, alloc) => acc + alloc.value, 0);
  const unallocatedPercentage = Math.max(100 - totalPercentage, 0);

  const chartData = allocations.map((alloc) => ({
    ...alloc,
    value: alloc.value,
  }));

  if (unallocatedPercentage > 0) {
    chartData.push({
      id: "unallocated",
      name: "Unallocated",
      value: unallocatedPercentage,
    });
  }

  return chartData;
};

const AllocationFund = ({ title, contract: contractAddress, contractHash, allocationNames, isKeplrConnected }) => {
  const [activeTab, setActiveTab] = useState("Actual");
  const [dataActual, setDataActual] = useState([]);
  const [selectedAllocations, setSelectedAllocations] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [totalPercentage, setTotalPercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isKeplrConnected) {
      if (activeTab === "Actual") {
        fetchDataActual();
      } else if (activeTab === "Preferred") {
        fetchUserInfo();
      }
    }
  }, [isKeplrConnected, activeTab]);

  useEffect(() => {
    // Calculate total percentage whenever selectedAllocations changes
    const total = selectedAllocations.reduce((acc, alloc) => acc + (parseInt(alloc.value) || 0), 0);
    setTotalPercentage(total);
  }, [selectedAllocations]);

  const fetchDataActual = async () => {
    try {
      showLoadingScreen(true);
      const querymsg = { get_allocation_options: {} };
      const response = await query(contractAddress, contractHash, querymsg);

      // Process allocations from response
      let transformedData = [];

      if (response.allocations) {
        // DeflationFund style response
        transformedData = response.allocations.map((allocation) => {
          const nameMatch = allocationNames.find((item) => item.id === String(allocation.allocation_id));
          return {
            id: allocation.allocation_id,
            name: nameMatch ? nameMatch.name : `Unknown (${allocation.allocation_id})`,
            value: parseInt(allocation.amount_allocated, 10),
          };
        });
      } else if (Array.isArray(response)) {
        // PublicBenefitFund style response
        transformedData = response.map((allocation) => {
          const nameMatch = allocationNames.find((item) => item.id === String(allocation.state?.allocation_id));
          return {
            id: allocation.state?.allocation_id,
            name: nameMatch ? nameMatch.name : `Unknown (${allocation.state?.allocation_id})`,
            value: parseInt(allocation.state?.amount_allocated, 10),
          };
        });
      }

      setDataActual(transformedData);
    } catch (error) {
      console.error(`Error fetching actual data for ${title}:`, error);
    } finally {
      showLoadingScreen(false);
    }
  };

  const fetchUserInfo = async () => {
    try {
      showLoadingScreen(true);
      const querymsg = {
        get_user_info: {
          address: window.secretjs.address,
        },
      };
      const response = await query(contractAddress, contractHash, querymsg);

      // Process user allocations from response
      let transformedData = [];

      if (response.user_info && response.user_info.percentages) {
        // DeflationFund style response
        transformedData = response.user_info.percentages.map((percentage) => {
          const nameMatch = allocationNames.find((item) => item.id === String(percentage.allocation_id));
          return {
            id: percentage.allocation_id,
            name: nameMatch ? nameMatch.name : `Unknown (${percentage.allocation_id})`,
            value: parseInt(percentage.percentage, 10),
          };
        });
      } else if (Array.isArray(response)) {
        // PublicBenefitFund style response
        transformedData = response.map((percentage) => {
          const nameMatch = allocationNames.find((item) => item.id === String(percentage.allocation_id));
          return {
            id: percentage.allocation_id,
            name: nameMatch ? nameMatch.name : `Unknown (${percentage.allocation_id})`,
            value: parseInt(percentage.percentage, 10),
          };
        });
      }

      setSelectedAllocations(transformedData);
    } catch (error) {
      console.error(`Error fetching user info for ${title}:`, error);
    } finally {
      showLoadingScreen(false);
    }
  };

  const openTab = (tabName) => {
    setActiveTab(tabName);
  };

  const addAllocation = (option) => {
    if (!selectedAllocations.find((alloc) => alloc.id === option.id)) {
      setSelectedAllocations([...selectedAllocations, { ...option, value: 0 }]);
    }
    setShowDropdown(false);
  };

  const removeAllocation = (id) => {
    setSelectedAllocations(selectedAllocations.filter((alloc) => alloc.id !== id));
  };

  const handlePercentageChange = (id, value) => {
    // Update the allocation percentage
    const updatedAllocations = selectedAllocations.map((alloc) =>
      alloc.id === id ? { ...alloc, value: parseInt(value, 10) || 0 } : alloc
    );

    // Update the state with the new allocations
    setSelectedAllocations(updatedAllocations);
  };

  const handleSetAllocation = async () => {
    if (totalPercentage !== 100) {
      setErrorMessage("Total allocation must equal 100%");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    try {
      setIsSubmitting(true);
      showLoadingScreen(true);
      setErrorMessage("");
      setSuccessMessage("");

      // Format allocations as expected by the contracts
      const formattedAllocations = selectedAllocations.map((alloc) => ({
        allocation_id: alloc.id,
        percentage: alloc.value.toString(),
      }));

      // Create message structure
      const contractMsg = {
        set_allocations: {
          percentages: formattedAllocations,
        },
      };

      // Call the contract function
      const response = await contract(contractAddress, contractHash, contractMsg);

      if (response.code !== undefined && response.code !== 0) {
        throw new Error(`Transaction failed with code ${response.code}: ${response.rawLog || "No error details"}`);
      }

      setSuccessMessage("Allocation successfully updated!");
      setTimeout(() => setSuccessMessage(""), 5000);

      // Refresh the preferred tab data
      fetchUserInfo();
    } catch (error) {
      console.error(`Error setting allocation for ${title}:`, error);
      setErrorMessage(error.message || "Failed to set allocation. Please try again.");
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setIsSubmitting(false);
      showLoadingScreen(false);
    }
  };

  return (
    <div className="allocation-fund-box">
      <h2>{title}</h2>
      <div className="allocation-fund-tab">
        <button className={`tablinks ${activeTab === "Actual" ? "active" : ""}`} onClick={() => openTab("Actual")}>
          Actual Allocation
        </button>
        <button
          className={`tablinks ${activeTab === "Preferred" ? "active" : ""}`}
          onClick={() => openTab("Preferred")}
        >
          Preferred Allocation
        </button>
      </div>

      {activeTab === "Actual" && (
        <div className="allocation-fund-chart-box">
          <div className="allocation-fund-canvas-container">
            <PieChart width={350} height={350}>
              <Pie
                data={dataActual}
                cx="50%"
                cy="50%"
                outerRadius={120}
                fill="#8884d8"
                paddingAngle={0}
                cornerRadius={2}
                startAngle={90}
                endAngle={450}
                dataKey="value"
                isAnimationActive={false}
              >
                {dataActual.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend
                content={(props) => renderCustomLegend(props, dataActual)}
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
              />
            </PieChart>
          </div>
        </div>
      )}

      {activeTab === "Preferred" && (
        <div className="allocation-fund-chart-box">
          <div className="allocation-fund-canvas-container">
            <div style={{ position: "relative", width: 350, height: 350 }}>
              <PieChart width={350} height={350}>
                <Pie
                  data={getChartDataWithUnallocated(selectedAllocations)}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  fill="#8884d8"
                  paddingAngle={0}
                  cornerRadius={2}
                  startAngle={90}
                  endAngle={450}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {getChartDataWithUnallocated(selectedAllocations).map((entry, index) => {
                    if (entry.name === "Unallocated") {
                      return <Cell key={`cell-${index}`} fill={UNALLOCATED_COLOR} />;
                    } else {
                      return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                    }
                  })}
                </Pie>
              </PieChart>
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: 24,
                  color: totalPercentage === 100 ? "green" : "red",
                }}
              >
                {`${totalPercentage}%`}
              </div>
            </div>
          </div>

          <div className="allocation-fund-input-container">
            {selectedAllocations.map((alloc) => (
              <div key={alloc.id} className="allocation-fund-input-group">
                <span>{alloc.name}</span>
                <input
                  type="number"
                  value={alloc.value}
                  onChange={(e) => handlePercentageChange(alloc.id, e.target.value)}
                  placeholder="%"
                />
                <button className="allocation-fund-circle-button" onClick={() => removeAllocation(alloc.id)}>
                  -
                </button>
              </div>
            ))}
          </div>

          <div className="allocation-fund-dropdown-container">
            <button className="allocation-fund-circle-button" onClick={() => setShowDropdown(!showDropdown)}>
              +
            </button>
            {showDropdown && (
              <select onChange={(e) => addAllocation(allocationNames.find((option) => option.id === e.target.value))}>
                <option value="">Select an option</option>
                {allocationNames.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {errorMessage && <div className="allocation-fund-error-message">{errorMessage}</div>}

          {successMessage && <div className="allocation-fund-success-message">{successMessage}</div>}

          {selectedAllocations.length > 0 && (
            <button
              onClick={handleSetAllocation}
              className="allocation-fund-claim-button"
              disabled={isSubmitting || totalPercentage !== 100}
            >
              {isSubmitting ? "Submitting..." : "Set Allocation"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AllocationFund;
