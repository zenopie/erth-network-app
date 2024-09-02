import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Legend } from 'recharts';
import './DeflationFund.css';
import { showLoadingScreen } from '../utils/uiUtils';
import { query } from '../utils/contractUtils';

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "7815b8b45275e14d060a553dbda6f16ac3ad6fce45adc2ec9bddad50e1e283f6";

const COLORS = ['#4CAF50', '#8BC34A', '#FF9800', '#CDDC39', '#009688', '#795548']; // Colors for allocations
const UNALLOCATED_COLOR = '#B0B0B0'; // Grey color for Unallocated

const allocationNames = [
  { id: '1', name: 'LP Rewards' },
  // Add more allocation names here
];

const renderCustomLegend = (props, data) => {
  const { payload } = props;
  const total = data.reduce((acc, entry) => acc + (entry.value || 0), 0);

  return (
    <ul
      style={{
        listStyleType: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {payload.map((entry, index) => {
        const value = entry.payload.value || 0;
        const name = entry.payload.name || 'N/A';
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
        const formattedPercentage = percentage.endsWith('.0') ? parseInt(percentage) : percentage;

        return (
          <li
            key={`item-${index}`}
            style={{
              margin: '0 10px',
              color: entry.color,
              whiteSpace: 'nowrap',
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
      id: 'unallocated',
      name: 'Unallocated',
      value: unallocatedPercentage,
    });
  }

  return chartData;
};

const DeflationFund = ({ isKeplrConnected }) => {
  const [activeTab, setActiveTab] = useState('Actual');
  const [dataActual, setDataActual] = useState([]);
  const [selectedAllocations, setSelectedAllocations] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [totalPercentage, setTotalPercentage] = useState(0); // State for total percentage

  useEffect(() => {
    if (isKeplrConnected) {
      if (activeTab === 'Actual') {
        fetchDataActual();
      } else if (activeTab === 'Preferred') {
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
      const response = await query(this_contract, this_hash, querymsg);

      const transformedData = response.allocations.map((allocation) => {
        const nameMatch = allocationNames.find((item) => item.id === String(allocation.allocation_id));
        return {
          id: allocation.allocation_id,
          name: nameMatch ? nameMatch.name : `Unknown (${allocation.allocation_id})`,
          value: parseInt(allocation.amount_allocated, 10),
        };
      });

      setDataActual(transformedData);
    } catch (error) {
      console.error("Error fetching actual data:", error);
    }
    showLoadingScreen(false);
  };

  const fetchUserInfo = async () => {
    try {
      showLoadingScreen(true);
      const querymsg = { get_user_info: { address: window.secretjs.address } }; 
      const response = await query(this_contract, this_hash, querymsg);
      const transformedData = response.user_info.percentages.map((percentage) => {
        const nameMatch = allocationNames.find((item) => item.id === String(percentage.allocation_id));
        return {
          id: percentage.allocation_id,
          name: nameMatch ? nameMatch.name : `Unknown (${percentage.allocation_id})`,
          value: parseInt(percentage.percentage, 10),
        };
      });

      setSelectedAllocations(transformedData);
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
    showLoadingScreen(false);
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

  return (
    <div className="deflation-fund-box">
      <h2>Deflation Fund</h2>
      <div className="deflation-fund-tab">
        <button
          className={`tablinks ${activeTab === 'Actual' ? 'active' : ''}`}
          onClick={() => openTab('Actual')}
        >
          Actual Allocation
        </button>
        <button
          className={`tablinks ${activeTab === 'Preferred' ? 'active' : ''}`}
          onClick={() => openTab('Preferred')}
        >
          Preferred Allocation
        </button>
      </div>

      {activeTab === 'Actual' && (
        <div className="chart-box">
          <div className="canvas-container">
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

      {activeTab === 'Preferred' && (
        <div className="chart-box">
          <div className="canvas-container">
            <div style={{ position: 'relative', width: 350, height: 350 }}>
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
                    if (entry.name === 'Unallocated') {
                      return <Cell key={`cell-${index}`} fill={UNALLOCATED_COLOR} />;
                    } else {
                      return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                    }
                  })}
                </Pie>
              </PieChart>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 24,
                  color: totalPercentage === 100 ? 'green' : 'red',
                }}
              >
                {`${totalPercentage}%`}
              </div>
            </div>
          </div>

          <div id="input-container">
            {selectedAllocations.map((alloc) => (
              <div key={alloc.id} className="allocation-input-group">
                <span>{alloc.name}</span>
                <input
                  type="number"
                  value={alloc.value}
                  onChange={(e) => handlePercentageChange(alloc.id, e.target.value)}
                  placeholder="%"
                />
                <button
                  className="circle-button"
                  onClick={() => removeAllocation(alloc.id)}
                >
                  -
                </button>
              </div>
            ))}
          </div>
          <div className="dropdown-container">
            <button className="circle-button" onClick={() => setShowDropdown(!showDropdown)}>
              +
            </button>
            {showDropdown && (
              <select
                onChange={(e) =>
                  addAllocation(
                    selectedAllocations.find((option) => option.id === e.target.value)
                  )
                }
              >
                <option value="">Select an option</option>
                {allocationNames.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {selectedAllocations.length > 0 && (
            <button onClick={() => console.log('Change Allocation')} className="claim-button">
              Change
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DeflationFund;
