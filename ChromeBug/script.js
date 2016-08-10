InvoiceSearchModel = {
    AsCustomer: false,
    Grouped: true,
    Page: 1
};

SelectedInvoices = {};

Summary = {
    Count: 0,
    SubTotal: 0
};

function applySelection(updateTotals) {
    // Re-apply selections
    $('.collection .collection-header .item-select input[type="checkbox"]').prop('checked', false);

    $('.collection .account').each(function () {
        $(this).find('.group-header .item-select input[type="checkbox"]').prop('checked', false);
    });

    $('.collection .item').each(function () {
        var $level = $(this);
        var $check = $level.find('.item-header .item-select input[type="checkbox"]');
        var $input = $level.find('.payment-amount input[name="payment-amount"]');
        var $reasonCode = $level.find('.payment-reason .fg-payment-reason select');
        var $freeFormText = $level.find('.payment-reason .reason-text textarea');
        var billID = $level.attr('data-id');
        var billingAccountID = $level.attr('data-billingaccount');
        var selected = false;

        if (SelectedInvoices[billID]) {
            var selection = SelectedInvoices[billID];

            $input.val(selection.Amount.toFixed(2));
            $reasonCode.val(selection.ReasonCode);
            $freeFormText.val(selection.ReasonText);
            selected = selection.Selected;

            validateSelection($level, $input, $reasonCode, selection.Amount, selection.ReasonText, selected);
        }
        else {
            selected = ($level.attr('data-selected') == 'True');
            $input.val($level.attr('data-defaultpayment'));
            $reasonCode.val('');
            $freeFormText.val('');

            if (selected) {
                var defaultPayment = parseCurrency($level.attr('data-defaultpayment'));

                SelectedInvoices[billID] = {
                    Amount: defaultPayment,
                    BillingAccountID: billingAccountID,
                    CreditMemo: false,
                    DefaultPayment: defaultPayment,
                    Selected: selected,
                    ReasonCode: '',
                    ReasonText: ''
                };
            }
        }

        $check.prop('checked', selected);
        $input.prop('disabled', !selected);

        $level.find('.payment-reason').toggleClass('payment-reason-hidden', !selected);
    });

    $('.collection .account').each(function () {
        var $this = $(this);
        var billingAccountID = $this.attr('data-id');

        var $popover = $('#cm-popover-' + billingAccountID);
        if ($popover.length == 0) {
            $popover = $this.find('.credit-memos .cm-popover-target');
        }

        var $creditMemos = $popover.find('table.table tr.credit-memo-item');
        var $link = $this.find('span.credit-memos a.cm-popover-toggle');
        var applied = 0;

        $creditMemos.each(function () {
            var billID = $(this).attr('data-id');

            if (SelectedInvoices[billID] && SelectedInvoices[billID].Selected) {
                applied += SelectedInvoices[billID].Amount;
            }
        });

        if (applied != 0) {
            $link.text('$' + applied.toCurrency() + ' ' + Biller.CreditMemoLabel + 's Applied');
        }
        else {
            $link.text('View ' + Biller.CreditMemoLabel + 's');
        }
    });

    calculateSummary(updateTotals);
}

function applySort() {
    if (!InvoiceSearchModel.Sort) {
        return;
    }

    var bits = InvoiceSearchModel.Sort.split(' ');
    var field = bits[0];
    var direction = bits[1];

    $('.invoices-table .invoices-header span.sortable').each(function () {
        var $this = $(this);

        if ($this.attr('data-field') == field) {
            if (direction == 'ASC') {
                $this.addClass('sort-asc');
            }
            else if (direction == 'DESC') {
                $this.addClass('sort-desc');
            }
        }
    });
}

function calculateSummary(updateTotals) {
    var $invoiceTable = $(".invoices-table");
    var count = parseInt($invoiceTable.attr('data-selected-count'));
    if (isNaN(count)) {
        count = 0;
    }

    var subtotal = parseCurrency($invoiceTable.attr('data-selected-amount'));
    if (isNaN(subtotal)) {
        subtotal = 0;
    }

    var cmCount = 0;
    var cmTotal = 0;

    $.each(SelectedInvoices, function (i, p) {
        if (p.CreditMemo) {
            if (p.Selected) {
                cmCount++;
                cmTotal += p.Amount;
            }
        }
        else {
            if ($('#invoice-row-' + i).attr('data-selected') == 'True') {
                count--;
                subtotal -= p.DefaultPayment;
            }

            if (p.Selected) {
                count++;
                subtotal += p.Amount;
            }
        }
    });

    if (updateTotals) {
        $('#payment .panel-body .subtotal .invoice-count, #payment .panel-footer .invoice-count').text(countLabel(count, Biller.InvoiceLabel));
        $('#payment .panel-body .subtotal .value, #payment .panel-footer .subtotal').text('$' + subtotal.toCurrency());
        $('#payment .panel-body .credit .memo-count').text(countLabel(cmCount, Biller.CreditMemoLabel));
        $('#payment .panel-body .credit .value').text('$' + cmTotal.toCurrency());
        $('#payment .panel-body .payment-details').removeClass("has-total has-fee");
    }

    $('form.bill-actions button.requires-bill').prop('disabled', (count == 0));
    $("#payment").toggleClass("csr-selection", (count > 1 && !Biller.AllowMultiPay && IsCSR));

    Summary = {
        Count: count,
        InvoiceTotal: subtotal,
        SubTotal: subtotal + cmTotal
    };

    return Summary;
}

function executeAction(action, state, billID, confirm, email, callback) {
    var data = {
        Action: action,
        BillID: billID,
        Confirm: confirm,
        Email: email,
        State: state,
        Selection: JSON.stringify(SelectedInvoices)
    };

    $.ajax({
        contentType: 'application/json',
        data: JSON.stringify(data),
        type: 'POST',
        url: "/BillPay/BillAction",
        success: function (r) {
            if (typeof (r) == "string") {
                $(".modal-action-confirm").remove();
                $('body').append(r);
                $.validator.unobtrusive.parse(".modal-action-confirm");
                $(".modal-action-confirm").modal();
            }
            else if (r.Redirect) {
                window.location = r.Redirect;
            }
            else {
                $(".modal-action-confirm").modal('hide');

                if (!billID) {
                    SelectedInvoices = {};
                    applySelection(true);
                }

                if (callback) {
                    callback(r);
                }
                else {
                    refreshInvoices();
                }
            }
        }
    });
}

function refreshInvoices() {
    $.ajax({
        contentType: 'application/json',
        data: JSON.stringify(InvoiceSearchModel),
        type: 'POST',
        url: "/BillPay/Invoices",
        success: function (r) {
            $("section.invoices").html(r);
            applySelection(true);
            applySort();
        }
    });
}

function validateSelection($level, $input, $reasonCode, amount, reasonText, selected) {
    var amountRemaining = parseCurrency($level.attr('data-amountremaining'));

    if ($input.length) {
        var $msg = $input.closest('.cell').find('.generic-error');

        $msg.text("").addClass("hidden");

        if (selected) {
            if (Biller.LimitPaymentToBill && Biller.RequireFullPaymentOfBill && amount != amountRemaining) {
                $msg.text("Payment must equal bill amount").removeClass("hidden");
            }
            else if (Biller.LimitPaymentToBill && amount > amountRemaining) {
                $msg.text("Payment cannot exceed bill amount").removeClass("hidden");
            }
            else if (Biller.RequireFullPaymentOfBill && amount < amountRemaining) {
                $msg.text("Payment must be at least bill amount").removeClass("hidden");
            }
        }
    }

    if ($reasonCode.length) {
        var $msg = $reasonCode.closest('.cell').find('.payment-code-error');

        $msg.addClass('hidden');

        if (selected) {
            var codeType = $($reasonCode[0].options[$reasonCode[0].selectedIndex]).attr('data-type');
            var valid = false;

            if (amount == amountRemaining) {
                valid = (codeType != "ShortPay" && codeType != "OverPay");
            }
            else if (amount < amountRemaining) {
                if (Biller.IsShortPayCodeRequired) {
                    valid = (codeType == "ShortPay");
                }
                else {
                    valid = (codeType != "OverPay");
                }
            }
            else if (amount > amountRemaining) {
                if (Biller.IsOverPayCodeRequired) {
                    valid = (codeType == "OverPay");
                }
                else {
                    valid = (codeType != "ShortPay");
                }
            }
            
            $msg.toggleClass('hidden', valid);
        }
    }

    if ($level.find(".reason-text").length) {
        var $msg = $reasonCode.closest('.cell').find('.payment-reason-error');

        $msg.addClass('hidden');

        if (selected) {
            var codeType = $($reasonCode[0].options[$reasonCode[0].selectedIndex]).attr('data-type');
            var valid = true;

            if (!reasonText) {
                if (codeType == "OverPay" && Biller.IsOverPayFreeformReasonRequired) {
                    valid = false;
                }
                else if (codeType == "ShortPay" && Biller.IsShortPayFreeformReasonRequired) {
                    valid = false;
                }
            }

            $msg.toggleClass('hidden', valid);
        }
    }
}

function validateAllSelected() {
    $('.collection .item').each(function () {
        var $level = $(this);
        var $input = $level.find('.payment-amount input[name="payment-amount"]');
        var $reasonCode = $level.find('.payment-reason .fg-payment-reason select');
        var billID = $level.attr('data-id');

        if (SelectedInvoices[billID]) {
            var selection = SelectedInvoices[billID];

            validateSelection($level, $input, $reasonCode, selection.Amount, selection.ReasonText, selection.Selected);
        }
    });
}

$(function () {
    var $body = $('body');

    $body.append('<p>Script was loaded.</p>');

    //Prevent validation from setting focus on the invalid field
    var settings = $.data($('#payment-form')[0], 'validator').settings;
    settings.focusInvalid = false;

    // Search handling
    $("form.search ul.dropdown-menu a").click(function (e) {
        e.preventDefault();

        var $a = $(this);

        $a.closest('div')
            .find('button')
            .attr('data-field', $a.attr('data-field'))
            .find('span.text')
            .text($a.text());
    });

    $("form.search").submit(function (e) {
        e.preventDefault();

        InvoiceSearchModel.AmountDueFrom = null;
        InvoiceSearchModel.AmountDueTo = null;
        InvoiceSearchModel.BillerInvoiceNo = null;
        InvoiceSearchModel.DueDateFrom = null;
        InvoiceSearchModel.DueDateTo = null;
        InvoiceSearchModel.ReferenceNumber = null;
        InvoiceSearchModel.StatementDateFrom = null;
        InvoiceSearchModel.StatementDateTo = null;
        InvoiceSearchModel.Page = 1;

        var field = $("form.search button.dropdown-toggle").attr('data-field');
        var value = $("#search").val();

        if (value != "") {
            if (field == "AmountDue") {
                value = parseCurrency(value);
                if (!isNaN(value)) {
                    InvoiceSearchModel.AmountDueFrom = value;
                    InvoiceSearchModel.AmountDueTo = value;
                }
            }
            else if (field == "BillerInvoiceNo") {
                InvoiceSearchModel.BillerInvoiceNo = value;
            }
            else if (field == "DueDate") {
                InvoiceSearchModel.DueDateFrom = value;
                InvoiceSearchModel.DueDateTo = value;
            }
            else if (field == "StatementDate") {
                InvoiceSearchModel.StatementDateFrom = value;
                InvoiceSearchModel.StatementDateTo = value;
            }
            else if (field == "ReferenceNumber") {
                InvoiceSearchModel.ReferenceNumber = value;
            }
        }

        refreshInvoices();
    });

    $("#adv-search-clear").click(function (e) {
        e.preventDefault();

        $("#advanced-search input.form-control").val("");
        $("#adv-search-submit").click();
    });

    $("#adv-search-submit").click(function (e) {
        e.preventDefault();

        InvoiceSearchModel.AmountDueFrom = null;
        InvoiceSearchModel.AmountDueTo = null;
        InvoiceSearchModel.BillerInvoiceNo = null;
        InvoiceSearchModel.DueDateFrom = null;
        InvoiceSearchModel.DueDateTo = null;
        InvoiceSearchModel.ReferenceNumber = null;
        InvoiceSearchModel.StatementDateFrom = null;
        InvoiceSearchModel.StatementDateTo = null;
        InvoiceSearchModel.Page = 1;

        $("#advanced-search input.form-control").each(function () {
            var $this = $(this);
            var field = $this.attr('data-field');
            var value = $this.val();

            if (value) {
                if (field == "AmountDueFrom" || field == "AmountDueTo") {
                    value = parseCurrency(value);
                    if (isNaN(value)) {
                        alert($this.val() + " is not a valid numeric amount.");
                        return;
                    }
                }

                InvoiceSearchModel[field] = value;
            }
        });

        refreshInvoices();
    });

    // Bill action handling
    $("form.bill-actions .bill-action").click(function (e) {
        e.preventDefault();

        var $this = $(this);

        executeAction($this.attr('data-action'), ($this.attr('data-state') == 'True'));
    });

    $("form.bill-actions .as-customer").click(function (e) {
        e.preventDefault();

        InvoiceSearchModel.AsCustomer = !InvoiceSearchModel.AsCustomer;

        $(this).text(InvoiceSearchModel.AsCustomer ? 'View As CSR' : 'View As Customer');

        refreshInvoices();
    });

    $body.on('click', '.modal-action-confirm .modal-footer button.submit', function (e) {
        $(".modal-action-confirm .modal-body form").submit();
    });

    $body.on('submit', '.modal-action-confirm .modal-body form', function (e) {
        e.preventDefault();

        var $this = $(this);
        var action = $this.attr('data-action');
        var state = ($this.attr('data-state') == 'True');
        var billID = $this.attr('data-bill');
        var email = $('.modal-action-confirm .modal-body form #invoice-action-email').val();

        executeAction(action, state, billID, true, email);
    });

    // Tab handling
    $body.on('click', '.invoices-nav .tabs a.js-link', function (e) {
        e.preventDefault();

        var $this = $(this);
        if ($this.hasClass('unpaid')) {
            InvoiceSearchModel.HidePaid = true;
            InvoiceSearchModel.CreditMemos = false;
            InvoiceSearchModel.Page = 1;
            refreshInvoices();
        }
        else if ($this.hasClass('all')) {
            InvoiceSearchModel.HidePaid = false;
            InvoiceSearchModel.CreditMemos = false;
            InvoiceSearchModel.Page = 1;
            refreshInvoices();
        }
        else if ($this.hasClass('credit-memo')) {
            InvoiceSearchModel.HidePaid = false;
            InvoiceSearchModel.CreditMemos = true;
            InvoiceSearchModel.Page = 1;
            refreshInvoices();
        }
    });

    InvoiceSearchModel.HidePaid = $('.invoices-nav .tabs a.unpaid').hasClass('active');

    // Pagination
    $body.on('click', '.invoices-nav .pagination-group a', function (e) {
        e.preventDefault();

        InvoiceSearchModel.Page = $(this).attr('data-page');
        refreshInvoices();
    });

    $body.on('submit', '.invoices-nav .pagination-form', function (e) {
        e.preventDefault();

        var page = parseInt($("#go-to-page").val());
        if (isNaN(page)) {
            return;
        }

        InvoiceSearchModel.Page = page;
        refreshInvoices();
    });

    // Grouping
    $body.on('click', '.invoices-nav a.grouping', function (e) {
        e.preventDefault();

        InvoiceSearchModel.Grouped = ($(this).attr('data-group') == 'show');
        InvoiceSearchModel.Page = 1;
        refreshInvoices();
    });

    // Exporting
    $body.on('click', '.invoices-nav a.export', function (e) {
        e.preventDefault();

        $("#export-form").empty();

        $.each(InvoiceSearchModel, function (k, v) {
            $("#export-form").append($('<input type="hidden">').prop('name', k).val(v));
        });

        $("#export-form").submit();
    });

    // Sorting
    $body.on('click', '.invoices-table .invoices-header span.sortable', function () {
        var $this = $(this);
        var field = $this.attr('data-field');
        var sort = "";

        if ($this.hasClass("sort-asc")) {
            sort = "desc";
        }
        else if (!$this.hasClass("sort-desc")) {
            sort = "asc";
        }

        $('.invoices-table .invoices-header span.sortable').removeClass("sort-asc sort-desc");

        if (sort == "asc") {
            $this.addClass("sort-asc");
            InvoiceSearchModel.Sort = field + " ASC";
        }
        else if (sort == "desc") {
            $this.addClass("sort-desc");
            InvoiceSearchModel.Sort = field + " DESC";
        }
        else {
            InvoiceSearchModel.Sort = null;
        }

        refreshInvoices();
    });

    $body.on('click', '.cm-popover-target thead th.sortable', function () {
        var $this = $(this);
        var $parent = $this.closest('.cm-popover-target');
        var field = $this.attr('data-field');
        var sort = "";

        if ($this.hasClass("sort-asc")) {
            sort = "desc";
        }
        else if (!$this.hasClass("sort-desc")) {
            sort = "asc";
        }

        $('thead th.sortable', $parent).removeClass("sort-asc sort-desc");

        if (sort == "asc") {
            $this.addClass("sort-asc");
        }
        else if (sort == "desc") {
            $this.addClass("sort-desc");
        }

        var items = $('tbody tr.credit-memo-item', $parent).get();

        items.sort(function (a, b) {
            if (field == "BillerInvoiceNo") {
                a = $(a).attr('data-billerinvoiceno');
                b = $(b).attr('data-billerinvoiceno');
            }
            else if (field == "AmountDue") {
                a = Math.abs(parseCurrency($(a).attr('data-amount')));
                b = Math.abs(parseCurrency($(b).attr('data-amount')));
            }
            else if (field == "dtStatement") {
                a = new Date($(a).attr('data-statement'));
                b = new Date($(b).attr('data-statement'));
            }
            else {
                a = parseInt($(a).attr('data-id'));
                b = parseInt($(b).attr('data-id'));
            }

            var result = 0;

            if (a < b) {
                result = -1;
            }
            else if (a > b) {
                result = 1;
            }

            if (sort == "desc") {
                result *= -1;
            }

            return result;
        });

        for (var i = 0; i < items.length; i++) {
            items[i].parentNode.appendChild(items[i]);
        }
    });

    // Invoice Payment Amount changes
    $body.on('change', '.invoice .payment-amount input[type="text"]', function () {
        var $this = $(this);
        var $level = $this.closest('.invoice');
        var number = parseCurrency(cleanNumber($this.val()));

        if (isNaN(number)) {
            number = 0;
        }

        $this.val(number.toFixed(2));

        $body.trigger('items-toggled', [$level]);
    });

    // Reason code changes
    $body.on('change', '.invoice .payment-reason .fg-payment-reason select', function () {
        var $this = $(this);
        var $level = $this.closest('.invoice');

        $body.trigger('items-toggled', [$level]);
    });

    $body.on('click', '.invoice .payment-reason a.js-popover-toggle', function () {
        var $this = $(this);
        var $level = $this.closest('.invoice');
        var $freeFormText = $level.find('.payment-reason .reason-text textarea');
        var billID = $level.attr('data-id');

        if (SelectedInvoices[billID]) {
            $freeFormText.val(SelectedInvoices[billID].ReasonText);
        }
        else {
            $freeFormText.val('');
        }
    });

    $body.on('change', '.invoice .payment-reason .reason-text textarea', function () {
        var $this = $(this);

        $this.val($this.val().replace(/\r?\n/g, ' '));
    });

    $body.on('keydown keyup', '.invoice .payment-reason .reason-text textarea', function (e) {
        if (e.which == 13) {
            e.preventDefault();
        }
    });

    $body.on('click', '.invoice .payment-reason .reason-text a.btn-success', function () {
        var $this = $(this);
        var $level = $this.closest('.invoice');

        $body.trigger('items-toggled', [$level]);
    });

    // Selection handling
    $body.on('items-toggled', function (e, $level) {
        if ($level.is('.collection')) {
            var $selectAll = $level.find('.collection-header .item-select input[type="checkbox"]');
            var selected = $selectAll.prop('checked');
            var data = $.extend({ selected: selected }, InvoiceSearchModel);
            
            $.post("/BillPay/SelectAll", data, function (r) {
                var $invoiceTable = $(".invoices-table");
                
                $invoiceTable.attr('data-selected-amount', r.Amount);
                $invoiceTable.attr('data-selected-count', r.Count);

                calculateSummary(true);
            });

            $('.collection .item').each(function () {
                $(this).attr('data-selected', (selected ? 'True' : 'False'));
                $level.find('.payment-reason').toggleClass('payment-reason-hidden', !selected);
            });

            if (!selected) {
                $('.collection .account .account-header span.credit-memos a.cm-popover-toggle')
                    .text('View ' + Biller.CreditMemoLabel + 's');
            }

            $.each(SelectedInvoices, function (i, p) {
                if (!p.CreditMemo || !selected) {
                    p.Selected = selected;
                }
            });
        }
        else if ($level.is('.group')) {
            var $groupCheck = $level.find('.group-header .item-select input[type="checkbox"]');
            var billingAccountID = $level.attr('data-id');
            var selected = $groupCheck.prop('checked');
            var data = $.extend({ billingAccountID: billingAccountID, selected: selected }, InvoiceSearchModel);

            $.post("/BillPay/SelectAccount", data, function (r) {
                var $invoiceTable = $(".invoices-table");

                $invoiceTable.attr('data-selected-amount', r.Amount);
                $invoiceTable.attr('data-selected-count', r.Count);

                calculateSummary(true);
            });

            $('.collection .item').each(function () {
                var $level = $(this);
                var itemAccountID = $level.attr('data-billingaccount');

                if (billingAccountID == itemAccountID) {
                    $level.attr('data-selected', (selected ? 'True' : 'False'));
                    $level.find('.payment-reason').toggleClass('payment-reason-hidden', !selected);
                }
            });

            if (!selected) {
                $level.find('.account-header span.credit-memos a.cm-popover-toggle')
                    .text('View ' + Biller.CreditMemoLabel + 's');
            }

            $.each(SelectedInvoices, function (i, p) {
                if (p.BillingAccountID == billingAccountID && (!p.CreditMemo || !selected)) {
                    p.Selected = selected;
                }
            });
        }
        else if ($level.is('.item')) {
            var $invoiceCheck = $level.find('.item-header .item-select input[type="checkbox"]:visible');
            var $input = $level.find('.payment-amount input[type="text"]');
            var $reasonCode = $level.find('.payment-reason .fg-payment-reason select');
            var $reasonText = $level.find('.payment-reason .reason-text textarea');
            var billID = $level.attr('data-id');
            var defaultPayment = parseCurrency($level.attr('data-defaultpayment'));
            var billingAccountID = $level.attr('data-billingaccount');
            var amountDue = parseCurrency($level.attr('data-amountdue'));
            var selected = $invoiceCheck.prop('checked');
            var reasonText = $.trim($reasonText.val());
            var amount;

            if ($input.length) {
                var number = cleanNumber($input.val());
                if (isNaN(parseCurrency(number))) {
                    number = "0.00";
                }

                amount = parseCurrency(number);
            }
            else {
                amount = defaultPayment;
            }            

            if (selected && !Biller.AllowMultiPay && !IsCSR) {
                $.each(SelectedInvoices, function (i, p) {
                    p.Selected = false;
                });

                $('section.invoices .invoices-table .invoice').each(function () {
                    var $level = $(this);
                    var $check = $level.find('.item-header .item-select input[type="checkbox"]');
                    var $input = $level.find('.payment-amount input[name="payment-amount"]');

                    if ($level.attr('data-id') != billID) {
                        $check.prop('checked', false);
                        $input.prop('disabled', true);

                        $body.trigger('items-toggled', [$level]);
                    }                    
                });
            }

            var recalculate = true;
            var validate = !!(SelectedInvoices[billID]);

            if (SelectedInvoices[billID] &&
                SelectedInvoices[billID].Amount == amount &&
                SelectedInvoices[billID].Selected == selected) {
                recalculate = false;
            }

            SelectedInvoices[billID] = {
                Amount: amount,
                BillingAccountID: billingAccountID,
                CreditMemo: false,
                DefaultPayment: defaultPayment,
                Selected: selected,
                ReasonCode: $reasonCode.val(),
                ReasonText: reasonText
            };

            $level.find('.payment-reason').toggleClass('payment-reason-hidden', !selected);
            
            if (validate) {
                validateSelection($level, $input, $reasonCode, amount, reasonText, selected);
            }

            if (recalculate) {
                calculateSummary(true);
            }
        }

        $(".bill-validation-error").addClass("hidden");
        $("#payment-invoice-selection").val(JSON.stringify(SelectedInvoices));
    });

    $("#remove-all-btn").click(function (e) {
        e.preventDefault();

        $.post("/BillPay/SelectNone");

        var $invoiceTable = $(".invoices-table");
        $invoiceTable.attr('data-selected-amount', 0);
        $invoiceTable.attr('data-selected-count', 0);

        $('.collection .item').each(function () {
            $(this).attr('data-selected', 'False');
        });

        SelectedInvoices = {};
        $("#payment-invoice-selection").val(JSON.stringify(SelectedInvoices));
        $("section.invoices .account .account-header span.credit-memos a.cm-popover-toggle").text('View ' + Biller.CreditMemoLabel + 's');

        applySelection(true);
    });

    var prevSelection = $("#payment-invoice-selection").val();
    if (prevSelection) {
        SelectedInvoices = JSON.parse(prevSelection);
    }

    applySelection(false);

    // View bill functionality
    $body.on('click', 'section.invoices .invoices-table .invoice .action a.view', function (e) {
        e.preventDefault();

        var billID = $(this).closest('.invoice').attr('data-id');

        openInvoice(billID);
    });

    $body.on('click', 'section.invoices .invoices-table .invoice .action a.mark-paid', function (e) {
        e.preventDefault();

        var $invoice = $(this).closest('.invoice');
        var billID = $invoice.attr('data-id');
        var paid = ($invoice.attr('data-paid') == 'True');

        executeAction("MarkPaid", !paid, billID);
    });

    $body.on('click', 'section.invoices .invoices-table .invoice .action a.mark-expired', function (e) {
        e.preventDefault();

        var $invoice = $(this).closest('.invoice');
        var billID = $invoice.attr('data-id');
        var expired = ($invoice.attr('data-expired') == 'True');

        executeAction("Expire", !expired, billID);
    });

    // Invoice payment history handling
    $body.on('js-collapse-toggle', function (e, $item, $child) {
        if (!$item.hasClass("invoice") || !$item.hasClass("open")) {
            return;
        }

        var $childBody = $child.find('.item-body');
        var billID = $item.attr('data-id');

        $childBody.empty();
        $child.addClass("spinner");

        $.ajax({
            data: { billID: billID },
            global: false,
            headers: { "X-Ajax-Redirect": 1 },
            type: 'POST',
            url: "/BillPay/History",
            error: function (xhr) {
                $child.removeClass("spinner");                
                ajaxErrorHandler(null, xhr);
            },
            success: function (r) {
                $child.removeClass("spinner");
                $childBody.html(r);
            }
        });
    });

    $body.on('click', 'section.payments .payments-table .payments-body div.payment a.view', function (e) {
        e.preventDefault();

        $("#modal-payment-details").remove();

        var transactionID = $(this)
            .closest(".collection-body .payment")
            .attr('data-confirmation-number');

        $.get('/Payment/Detail', { transactionID: transactionID }, function (data) {
            $('body').append(data);
            $("#modal-payment-details").modal();
        })
    });

    $body.on('click', '#modal-payment-details .modal-footer .actions .email-btn', function (e) {
        e.preventDefault();

        $('#modal-payment-details').modal('hide');
        $("#modal-payment-details-email").modal();
    });

    $body.on('submit', '#modal-payment-details-email form', function (e) {
        e.preventDefault();

        var email = $("#modal-payment-details-emailaddress").val();
        var paymentID = $("#modal-payment-details").attr('data-confirmation-number');

        var data = {
            emailAddress: email,
            paymentID: paymentID
        };

        $.post('/Payment/SendPaymentStatusEmail', data, function (r) {
            $('#modal-payment-details-email').modal('hide');
            if (r.status) {
                $.fn.showAlert("Payment Status Report has been sent to " + email, "alert-success", true);
            }
            else {
                $.fn.showAlert("The system cannot email your Payment Status Report at this time", "alert-danger");
            }
        });
    });

    // Credit memo handling
    $body.on('click', '.invoices-body .account .account-header span.credit-memos a.cm-popover-toggle', function (e) {
        e.preventDefault();

        var $a = $(this);
        var $account = $a.closest('.account');
        var billingAccountID = $account.attr('data-id');

        var $popover = $('#cm-popover-' + billingAccountID);
        if ($popover.length == 0) {
            $popover = $account
                .find('.credit-memos .cm-popover-target')
                .attr('id', 'cm-popover-' + billingAccountID)
                .appendTo('body');
        }

        var $creditMemos = $popover.find('table.table tr.credit-memo-item');
        var applied = 0;

        $creditMemos.each(function () {
            var $row = $(this);
            var $check = $row.find('input[type="checkbox"]');
            var $reasonText = $row.find('input.freeform-text');
            var billID = $row.attr('data-id');
            var amount = parseCurrency($row.attr('data-amount'));
            var selected = false;
            var reasonText = "";

            if (SelectedInvoices[billID]) {
                var selection = SelectedInvoices[billID];
                reasonText = selection.ReasonText;
                selected = selection.Selected;
            }
            else {
                selected = ($row.attr('data-selected') == 'True');
            }

            if (selected) {
                applied += amount;
            }

            $check.prop('checked', selected);
            $reasonText.val(reasonText);
            $reasonText.parent().find('.generic-error').addClass("hidden");
        });

        $popover.find('table.table tfoot td.cm-selected').text('$' + applied.toCurrency());

        var p = $a.offset();

        $popover
            .css({ left: (p.left - 530), top: (p.top + 20) })
            .show();
    });

    $body.on('click change', '.cm-popover-target table.table tr.credit-memo-item input[type="checkbox"]', function (e) {
        var $checkbox = $(this);
        var $creditMemos = $checkbox.closest('.cm-popover-target').find('table.table tr.credit-memo-item');
        var applied = 0;

        $creditMemos.each(function () {
            var $row = $(this);
            var $check = $row.find('input[type="checkbox"]');
            var checked = $check.prop('checked');
            var amount = parseCurrency($row.attr('data-amount'));

            if (checked) {
                applied += amount;
            }
        });
        $checkbox.closest('table').find('tfoot td.cm-selected').text('$' + applied.toCurrency());
    });

    $body.on('click', '.cm-popover-target table.table tr.credit-memo-item a.mark-expired', function (e) {
        e.preventDefault();

        var $creditMemo = $(this).closest('tr.credit-memo-item');
        var $check = $creditMemo.find('input[type="checkbox"]');
        var billID = $creditMemo.attr('data-id');
        
        $check.prop('checked', false).change();

        executeAction("Expire", true, billID, true, null, function (r) {
            $creditMemo.remove();
        });
    });

    $body.on('click', '.cm-popover-target a.btn-success', function (e) {
        e.preventDefault();

        var $a = $(this);
        var $creditMemos = $a.closest('.cm-popover-target').find('table.table tr.credit-memo-item');
        var billingAccountID = $a.closest('.cm-popover-target').attr('data-id');
        var $link = $('#acct-' + billingAccountID + ' span.credit-memos a.cm-popover-toggle');
        var applied = 0;
        var allValid = true;

        if (Biller.IsCreditMemoFreeformReasonRequired) {
            $creditMemos.each(function () {
                var $row = $(this);
                var $check = $row.find('input[type="checkbox"]');
                var $reasonText = $row.find('input.freeform-text');
                var valid = (!$check.prop('checked') || $reasonText.val().length > 0);

                if (!valid) {
                    allValid = false;
                }

                $reasonText.parent().find('.generic-error').toggleClass("hidden", valid);
            });
        }

        if (!allValid) {
            return;
        }

        $a.closest('.cm-popover-target').hide();

        $creditMemos.each(function () {
            var $row = $(this);
            var $check = $row.find('input[type="checkbox"]');
            var $reasonText = $row.find('input.freeform-text');
            var checked = $check.prop('checked');
            var billID = $row.attr('data-id');
            var amount = parseCurrency($row.attr('data-amount'));

            if (SelectedInvoices[billID]) {
                SelectedInvoices[billID].ReasonText = $reasonText.val();
                SelectedInvoices[billID].Selected = checked;
            }
            else if (checked) {
                SelectedInvoices[billID] = {
                    Amount: amount,
                    BillingAccountID: $row.attr('data-billingaccount'),
                    CreditMemo: true,
                    ReasonText: $reasonText.val(),
                    Selected: true
                };
            }

            if (checked) {
                applied += amount;
            }
        });

        if (applied != 0) {
            $link.text('$' + applied.toCurrency() + ' ' + Biller.CreditMemoLabel + 's Applied');
        }
        else {
            $link.text('View ' + Biller.CreditMemoLabel + 's');
        }

        $("#payment-invoice-selection").val(JSON.stringify(SelectedInvoices));
        calculateSummary(true);
    });

    $body.on('click', '.cm-popover-target .js-popover-dismiss', function (e) {
        e.preventDefault();
        $(this).closest('.cm-popover-target').hide();
    });

    $body.click(function (e) {
        var $target = $(e.target);
        if ($target.parents(".fg-credit-memos").length == 0 && $target.parents(".cm-popover-target").length == 0) {
            $(".cm-popover-target").hide();
        }
    });

    // Payment method handling
    $('select#payment-method').change(function (e, notChanged) {
        var $select = $(this);
        var $option = $(this.options[this.selectedIndex]);
        var showCvv = false;
        
        if (Biller.RequiresCVVCode && $option.attr('data-cc') == 'True') {
            var paymentDate = new Date($("#payment-date").val());
            var defaultPaymentDate = new Date($("#payment-date").attr('data-default-date'));

            if (paymentDate > defaultPaymentDate) {
                showCvv = Biller.RequiresFDPPreAuth;
            }
            else {
                showCvv = true;
            }
        }

        if (showCvv && !notChanged) {
            $('#security-code').val($option.attr('data-cvv-mask'));
        }

        $("#payment-form div.fg-security-code").toggle(showCvv);
        $("#fee-calc-btn").click();
    }).change();

    $('#add-payment-method').click(function (e) {
        $('#modal-add-payment-method').modal();
        $('select#payment-method').val('');
    });

    $('#modal-add-payment-method').on('hidden.bs.modal', function (e) {
        var result = $('#modal-add-payment-method').data('result');
        if (result) {
            var $select = $('select#payment-method');
            var paymentAccount = result.paymentAccount;

            var $option = $('<option>')
                .attr('value', result.index)
                .attr('data-cc', (paymentAccount.IsCreditCard ? 'True' : 'False'))
                .attr('data-cvv-mask', paymentAccount.CcCVVMask)
                .text(paymentAccount.DisplayDescription);

            $select.append($option);
            $select.val(result.index);
            $select.change();

            $select.removeClass("input-validation-error");
            $select.siblings('.field-validation-error').empty();
        }
    });

    $('#security-code').focus(function () {
        var $cvv = $(this);
        if ($cvv.val().charAt(0) == '*') {
            $cvv.val('');
        }
    });

    // Date handling
    $('#payment-date').change(function () {
        $('select#payment-method').trigger("change", true);
    });

    // Fee recalculation
    $('#fee-calc-btn, #payment .panel-body .total div.calculate a').click(function (e) {
        e.preventDefault();

        $("#payment-invoice-selection").val(JSON.stringify(SelectedInvoices));

        $.post("/Payment/BillPayCalculateTotal", $("#payment-form").serialize(), function (r) {
            $('#payment .panel-body .fee .value').text('$' + r.Fee.toCurrency());
            $('#payment .panel-body .total .value').text('$' + r.Total.toCurrency());

            $('#payment .panel-body .payment-details')
                .toggleClass("has-fee", (r.Fee > 0))
                .addClass("has-total");
        });
    });

    // Payment submission handling
    $("#payment-form").submit(function (e) {
        validateAllSelected();

        if (Summary.Count == 0) {
            $(".bill-validation-error").text("At least one invoice must be selected for payment").removeClass("hidden");
            e.preventDefault();
            return false;
        }
        else if (Summary.Count > 1 && !Biller.AllowMultiPay) {
            $(".bill-validation-error").text("Only one bill can be selected for payment").removeClass("hidden");
            e.preventDefault();
            return false;
        }
        else if (Summary.SubTotal < Biller.MinimumPayment) {
            $(".bill-validation-error").text("Payment amount must be at least $" + Biller.MinimumPayment.toCurrency()).removeClass("hidden");
            e.preventDefault();
            return false;
        }
        else if (Summary.SubTotal > Biller.MaximumPayment) {
            $(".bill-validation-error").text("Payment amount must be no more than $" + Biller.MaximumPayment.toCurrency()).removeClass("hidden");
            e.preventDefault();
            return false;
        }

        var invoiceErrors = $('section.invoices .invoices-table .invoice .cell .generic-error:visible');
        if (invoiceErrors.length) {
            $(".bill-validation-error").text("One or more invoices have an invalid selection").removeClass("hidden");
            e.preventDefault();
            return false;
        }

        $("#payment-invoice-selection").val(JSON.stringify(SelectedInvoices));
    });
});