let labels = [];
let stake_amount = 0;
// Get the container element
const container = document.getElementById('input-container');

// Function to generate a random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

async function checkAllocations() {
    let allocationQuery = { get_allocation: { address: window.secretjs.address } };
    let allocationInfo = await query(GOV_CONTRACT, GOV_HASH, allocationQuery);
    let allocationOptionsQuery = { get_allocation_options: {} };
    let allocationOptions = await query(GOV_CONTRACT, GOV_HASH, allocationOptionsQuery);
    let querymsg = {get_stake: {address: window.secretjs.address}}
    let allocation_info =  await query(GOV_CONTRACT, GOV_HASH, querymsg);
    // Display the allocation information
    stake_amount = allocation_info.amount;

    // Data for the first chart (My Preferred Allocation)
  
    let values = [];
    let percentages = [];
    let total = 0;
    let backgroundColors = {};
    let myChartOptions = {
        tooltips: {
            callbacks: {
                label: function (tooltipItem, data) {
                    const dataset = data.datasets[tooltipItem.datasetIndex];
                    const currentValue = dataset.data[tooltipItem.index];
                    return currentValue + '%'; // Add the percentage symbol
                }
            }
        }
    };

    // Check if there are allocations
    if (allocationInfo.allocations.length > 0) {
        for (let i = 0; i < allocationInfo.percentages.length; i++) {
            labels.push(allocationInfo.percentages[i].address);
            values.push(allocationInfo.percentages[i].percentage);
            backgroundColors[allocationInfo.percentages[i].address] = getRandomColor();
        }
    } else {
        // If there are no allocations, set default values
        labels.push('Unallocated');
        values.push(100);
        backgroundColors['Unallocated'] = getRandomColor();
    }

    // Create data for the first chart
    let myChartData = {
        labels: labels,
        datasets: [{
            data: values,
            backgroundColor: labels.map(label => backgroundColors[label])
        }]
    };

    // Create the first chart
    let myChart = new Chart(document.getElementById('myChart'), {
        type: 'pie',
        data: myChartData,
        options: myChartOptions
    });

    // Data for the second chart (Allocation Options)
    labels = [];
    values = [];
    percentages = [];
    total = 0;

    // Populate data for the second chart
    for (let i = 0; i < allocationOptions.allocations.length; i++) {
        let amount = parseInt(allocationOptions.allocations[i].amount, 10);
        labels.push(allocationOptions.allocations[i].address);
        values.push(amount);
        total += amount;
        if (!backgroundColors[allocationOptions.allocations[i].address]) {
            backgroundColors[allocationOptions.allocations[i].address] = getRandomColor();
        }
    }

    // Calculate percentages for the second chart
    for (let i = 0; i < values.length; i++) {
        let percentage = (values[i] / total) * 100;
        percentage = Math.round(percentage * 100) / 100;
        percentages.push(percentage);
    }

    // Create data for the second chart
    let currentChartData = {
        labels: labels,
        datasets: [{
            data: percentages,
            backgroundColor: labels.map(label => backgroundColors[label])
        }]
    };

    // Create the second chart
    let currentChart = new Chart(document.getElementById('currentChart'), {
        type: 'pie',
        data: currentChartData,
        options: myChartOptions // Reuse the same options for consistency
    });

    // Get the container element
    const container = document.getElementById('input-container');

    // Clear the container first to avoid duplication
    container.innerHTML = '';

    // Iterate over the combined array
    labels.forEach((label, index) => {
        // Create a new label element
        const labelElement = document.createElement('label');
        // Set the text content of the label
        labelElement.textContent = label + ': ';
        
        // Create a new input element
        const inputElement = document.createElement('input');
        // Set the input type
        inputElement.type = 'number';
        // Give each input element a unique ID
        inputElement.id = `input-${index}`;

        // Append the label and input element to the container
        container.appendChild(labelElement);
        container.appendChild(inputElement);
        // Optionally, add a line break for better readability
        container.appendChild(document.createElement('br'));
        // Add event listener to input elements
        inputElement.addEventListener('input', updateTotal);
    });
}

// Function to update the total when any input changes
function updateTotal() {
    let sum = 0;
    // Iterate over input elements
    for (let i = 0; i < labels.length; i++) {
        // Get the value of each input element and parse it to a number
        let inputValue = parseFloat(document.getElementById(`input-${i}`).value);
        // Add the value to the sum
        sum += isNaN(inputValue) ? 0 : inputValue;
    }
    // Update the value of the total input element
    let totalElement = document.getElementById('total');
    totalElement.value = sum;
    
    // Add or remove the indicator class based on the total value
    if (sum !== 100) {
        totalElement.classList.add('total-indicator'); // Add the class for the indicator
    } else {
        totalElement.classList.remove('total-indicator'); // Remove the class if total is 100
    }
}


function getValues() {
    const result = labels.map((label, index) => {
        const inputElement = document.getElementById(`input-${index}`);
        return {
            address: label,
            percentage: inputElement.value // Keep the value as a string
        };
    }).filter(allocation => parseFloat(allocation.percentage) > 0); // Filter out allocations with percentage <= 0

    const totalPercentage = result.reduce((total, allocation) => total + parseFloat(allocation.percentage), 0);

    if (totalPercentage !== 100) {
        alert('Total percentage must be 100%');
        return null; // Return null to indicate an error
    }

    return result; // Return the array of objects
}



async function changeAllocation() {
    checkAccountExists(secretjs.address);
    if (stake_amount == 0){
        alert('no ERTH deposit');
        return;
    }
    const percentages = getValues(); // Get the user input

    if (percentages === null) {
        return; // Stop execution if values are null
    }


    let msg = new MsgExecuteContract({
        sender: secretjs.address,
        contract_address: GOV_CONTRACT,
        code_hash: GOV_HASH,
        msg: {
            set_allocation: {
                percentages: percentages // Use the dynamically created array
            }
        }
    });

    let resp = await secretjs.tx.broadcast([msg], {
        gasLimit: 1_000_000,
        gasPriceInFeeDenom: 0.1,
        feeDenom: "uscrt",
    });
    // Hard refresh the page
    location.reload(true);
}




function start(){
    checkAllocations();
}