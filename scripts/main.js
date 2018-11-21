"use strict";

var recognitio = null;
Rust.recognitio.then(function(lib) {recognitio = lib;}); //so, it doesn't support synchronous loading?

var ontology = "";
if (localStorage.getItem('ontology')) ontology = localStorage.getItem('ontology');

// Polymode Definition

var em_width_from = {};
function calc_letter_widths ()
{
	for (var i = 33; i < 126; ++i)
	{
		var letter = String.fromCharCode(i);
		$("#let").text(letter);
		var width = $("#let").width(); 
		em_width_from[letter] = width / parseFloat($("#let").css("font-size"));
	}

	$("#let").text("| |");
	var width = $("#let").width(); 
	em_width_from[" "] = (width - (em_width_from["|"])) / parseFloat($("#let").css("font-size"));
	// Be careful messing with the above line! Yes, it doesn't even make sense dimensional-analytically. But the proper dimensional-analytical version performs far worse. TODO: find out how to properly do this.
}

function calc_token_width (token)
{
	var width = 0;
	for (var i = 0; i < token.length; ++i)
	{
		width += em_width_from[token[i]];
	}
	return width + em_width_from[" "];
}

var state = "none"

function into_none ()
{
	state = "none";
	$("#mode").text("recognitio").addClass("bg-secondary");
	$("#textbar").val("");
}

function from_none ()
{
	$("#mode").removeClass("bg-secondary");
}

function into_chat ()
{
	state = "chat";
	$("#mode").text("chat").addClass("bg-primary");
}

function from_chat ()
{
	$("#mode").removeClass("bg-primary");
}

function into_buzz ()
{
	state = "buzz";
	$("#mode").text("buzz").addClass("bg-danger");
}

function from_buzz ()
{
	$("#mode").removeClass("bg-danger");
}

function try_none ()
{
	switch (state)
	{
		case "chat":
			from_chat(); into_none();
			return true;
		break;
		case "buzz":
			from_buzz();
			try_reading(); //move this into the try buzz->none function
			into_none();
			return true;
		break;
	}

	return false;
}

function try_buzz ()
{
	if (state == "none" && try_interrupt())
	{
		from_none(); into_buzz();
		return true;
	}
	
	return false;
}

function try_chat ()
{
	/*switch (state)
	{
		case "none":
			from_none(); into_chat();
			return true;
		break;
	}*/

	return false;
}

var play_state = "idle"; //none, playing, or interrupted
var question_time_total_ms = 1;
var question_time_start_ms = 1;
var time_bar_interval;
var reader_interval;
var reader_period_ms = 260;
var reader_tokens_read = 0;
var tokens;

var when_interrupt_started;

var question;
var challenge;
var response;

var gets = 0;
var negs = 0;

function into_idle ()
{	
	$("#time-bar").removeClass("progress-bar-animated").css('transition', 'width 0.3s ease-in-out 0.2s');

	play_state = "idle";

	$("#quotient").text("0");
	$("#remainder").text("0");
	$("#time-bar").width('0%');
}

function from_idle ()
{
	question = recognitio.generate_question(ontology);
	challenge = recognitio.challenge(question).replace(/_/g, " ");
	response = recognitio.response(question).replace(/_/g, " ");
	tokens = challenge.split(" ");

	$("#quest").removeClass("nil");
	$("#question").removeClass("nil").addClass("blk");
	for (var i = 0; i < tokens.length; ++i)
	{
		//"~".repeat(tokens[i].length)
		$("#question").append("<span class=\"unknown\" style=\"display:inline-block;width:" + calc_token_width(tokens[i]) + "em\"></span>");
	} //can't do for now - the width of each word must be calculated, then other magic must be done.

	$("#time-bar").addClass("progress-bar-animated").css('transition', 'none');

	question_time_total_ms =  reader_period_ms * tokens.length + 4000;//TODO get time from bridge
	question_time_start_ms = Date.now();
}

function into_reading ()
{	
	play_state = "reading";
//TODO set timeout with an array of times that are proportional to character, save for commas (2*char), periods (4*char)
	time_bar_interval = setInterval
	(
		function ()
		{
			if (play_state != "reading") return;
			
			var elapsed_time_ms = Date.now() - question_time_start_ms;
	
			var left_time_ms = question_time_total_ms - elapsed_time_ms;
	
			if (left_time_ms < 0)
			{
				try_idle();
				return;
			}
	
			$("#quotient").text(Math.floor(left_time_ms / 1000).toString());
			$("#remainder").text((left_time_ms / 1000 % 1).toFixed(4).substring(2, 3));
			$("#time-bar").width((100 * (elapsed_time_ms / question_time_total_ms)).toString() + "%");
		},
	);

	//$("#history").prepend("<div class=\"card card-body text-std mb-3 text-greyer bg-dark blk current\"></div>")

	reader_interval = setInterval
	(
		function ()
		{
			if (reader_tokens_read >= tokens.length) return;

			$("#question").find("span").eq(reader_tokens_read).removeClass("unknown").removeAttr("style").text(tokens[reader_tokens_read] + " ");
			//$("#history").find("div").eq(0).append("<span class>" + tokens[reader_tokens_read] + " </span>");
			reader_tokens_read += 1;
		}, reader_period_ms
	)
}

function from_reading ()
{
	clearInterval(time_bar_interval);
	clearInterval(reader_interval);
}

function into_interrupt ()
{
	play_state = "interrupt";
	when_interrupt_started = Date.now(); //milliseconds
}

function from_interrupt ()
{
	var elapsed = Date.now() - when_interrupt_started;
	question_time_start_ms += elapsed;
}

function try_idle ()
{
	switch (play_state)
	{
		case "reading":
			from_reading();

			$("#quest").addClass("nil");
			$("#question").empty().removeClass("blk").addClass("nil");
			reader_tokens_read = 0;
			$("#history").prepend("<div class=\"card bg-dark mb-3\"><div class=\"card-header text-std text-greyer\">" + response + "</div><div class=\"card-body text-std text-greyer\">" + challenge + "</div></div>");
		
			into_idle();
			return true;
		break;
	}

	return false;
}

function try_reading ()
{
	switch (play_state)
	{
		case "idle":
			from_idle(); into_reading();
			return true;
		break;
		case "interrupt":
			from_interrupt();
			var dist = 1.0 * levenshtein($("#textbar").val(), response);
			var err = dist / response.length;

			if (err < 0.2 || dist <= 2)
			{
				into_reading();
				try_idle();
				alert("Correct!");
				gets += 1;
				$("#ngets").text("Gets " + gets);
			}
			else
			{
				into_reading();
				alert("Incorrect.");
				negs += 1;
				$("#nnegs").text("Negs " + negs);
			}

			return true;
		break;
	}

	return false;
}

function try_interrupt ()
{
	switch (play_state)
	{
		case "reading":
			from_reading(); into_interrupt();
			return true;
		break;
	}

	return false;
}

// Raw Event Binding

$("#textbar").click
(
	function ()
	{
		if (state == "none" && play_state == "reading") try_buzz();
		else setTimeout(function () {$("#textbar").blur();}, 0);
	}
);

$("#textbar").focus
(
	function ()
	{
		if (play_state == "idle") setTimeout(function () {$("#textbar").blur();}, 0);
	}
);

$("#textbar").blur
(
	function ()
	{
		if (state == "buzz") setTimeout(function () {$("#textbar").focus();}, 0); // the timeout defers focus until after blur has registered
		else try_none();
	}
);

$("#speed-range").on
(
	"input", 
	function ()
	{
		$(this).trigger("change");
	}
);

$("#speed-range").change
(
	function ()
	{
		reader_period_ms = $(this).val();
	}
);

$("#ontology-file-input").change
(
	function ()
	{
		var file = $("#ontology-file-input")[0].files[0]
		$("#ontology-file-label").text(file.name);
		var reader = new FileReader();
		reader.onload =
			function(event)
			{
				ontology = recognitio.load_ontology(event.target.result);
				localStorage.setItem("ontology", ontology);
			};
		reader.readAsText(file);
	}
);

$("#dropdown-button-buzz").click
(
	function ()
	{
		try_buzz();
		$("#textbar").focus();
	}
);

$("#dropdown-button-next").click
(
	function ()
	{
		try_reading();
	}
);

$("#dropdown-button-reset").click
(
	function ()
	{
		gets = 0;
		negs = 0;
		$("#ngets").text("Gets");
		$("#nnegs").text("Negs");
	}
);

$(document).keypress
(
	function (e)
	{	
		switch (e.key)
		{
			case "y":
				if (try_chat())
				{
					$("#textbar").focus();
					return false;
				}
			break;
			case " ":
				if (try_buzz())
				{
					$("#textbar").focus();
					return false;
				}
			break;
			case "n":
				if (state == "none" && try_reading())
				{
					return false;
				}
			break;
			case "Enter":
				if (try_none())
				{
					$("#textbar").blur();
					return false;
				}
			break;
			case "Escape": // TODO Logic
				if (state == "none" || state == "chat")
				{
					$("#textbar").blur();
					return false;
				}
				
			break;
		}
	}
);

// Init Site

into_none();
into_idle();
calc_letter_widths();

window.focus();