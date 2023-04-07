define([
	"./Library",
	"./Route",
	"./Subroute",
	"./Page"
], function ScrollNavPiece(
	Library,
	Route,
	Subroute,
	Page) {

	var moved = false;

	var scrolls = [];

	var highestIndex = -1;

	function scroll() {

		if (moved) {

			moved = false;

			return;
		}

		for (var i = 0; i < scrolls.length; i++) {

			scrolls[i]();
		}
	}

	addEventListener("scroll", scroll);

	function ScrollNavPiece(pages) {

		var initialised = false;

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		var router;

		var subroute;

		this.datumPiecesPages = [];

		this.onBind = function(element) {

			var self = this;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			route = Route.get();

			subroute = subroute ||
				new Subroute(
					route,
					function() { return currentIndex; },
					function(index) { self.showPage(index); });

			Route.set(subroute);

			this.datumPiecesPages = [];

			for (var i = 0; i < pages.length; i++) {

				var page = pages[i].page;

				if (typeof page == "function") {

					page = page();
				}

				this.datumPiecesPages.push(new Page(i, page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var pageElement = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";
			container.appendChild(pageElement);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "hidden";
			hidden.style.display = "none";

			element.appendChild(container);
			element.appendChild(hidden);

			router =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word, routeIndex);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				}, true);
		};

		function routePage(hash, routeIndex) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					highestIndex = Math.max(highestIndex, routeIndex);

					eventuallyScroll(i, routeIndex, 100);

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			initialised = true;
			currentIndex = -1;
			activeIndex(-1);
		}

		function eventuallyScroll(index, routeIndex, retry) {

			var child = container.children[index];

			if (highestIndex > routeIndex) {

				initialise(index);
			}
			else if (child && child.getBoundingClientRect().height) {

				initialise(index);

				highestIndex = -1;
				moved = true;

				child.scrollIntoView();
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyScroll(index, routeIndex, --retry);
				}, 10);
			}
			else if (child) {

				initialise(index);

				highestIndex = -1;
				moved = true;

				child.scrollIntoView();
			}
			else {

				initialise(index);

				highestIndex = -1;
			}
		}

		function initialise(index) {

			initialised = true;

			currentIndex = index;
			activeIndex(index);
		}

		this.hidden =
			new Library.Binding({

				init: function() {

					scrolls.push(scroll);
				},
				destroy: function() {

					scrolls.splice(scrolls.indexOf(scroll), 1);

					Route.set(route);
				}
			});

		function scroll() {

			if (!initialised) {

				return;
			}

			var children = container.children;

			var index = 0;
			var bestTop = Number.MIN_SAFE_INTEGER;
			var found = false;

			for (var i = 0; i < children.length; i++) {

				var child = children[i];
				var top = child.getBoundingClientRect().top - 50;

				if (top <= 0 && top >= bestTop) {

					bestTop = top;
					index = i;
					found = true;
				}
			}

			var oldIndex = currentIndex;

			if (found) {

				currentIndex = index;
				activeIndex(index);
			}
			else {

				currentIndex = -1;
				activeIndex(-1);
			}

			if (oldIndex != currentIndex) {

				router.update();
			}
		}

		this.showPage = function(index) {

			if (!initialised) {

				return;
			}

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
