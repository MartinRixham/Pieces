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

	var initialised = false;

	var moved = false;

	var scrolls = [];

	function scroll() {

		if (!initialised) {

			return;
		}

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

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		var router;

		var subroute;

		this.pages = [];

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

			this.pages = [];

			for (var i = 0; i < pages.length; i++) {

				this.pages.push(new Page(i, pages[i].page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "hidden";
			hidden.style.display = "none";

			element.appendChild(container);
			element.appendChild(hidden);

			router =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);
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

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					eventuallyScroll(i, 1);

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			if (container.getBoundingClientRect().top < 50) {

				moved = true;

				scrollTo(0, 0);
			}

			initialised = true;
			currentIndex = -1;
			activeIndex(-1);
		}

		function eventuallyScroll(index, wait) {

			var child = container.children[index];

			if (child && child.getBoundingClientRect().height) {

				moved = true;
				initialised = true;

				currentIndex = index;
				activeIndex(index);

				child.scrollIntoView();
			}
			else if (wait < 1000) {

				setTimeout(function() {

					eventuallyScroll(index, wait * 2);
				}, wait);
			}
			else if (child) {

				moved = true;
				initialised = true;

				currentIndex = index;
				activeIndex(index);

				child.scrollIntoView();
			}
			else {

				initialised = true;

				currentIndex = index;
				activeIndex(index);
			}
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

			var child = container.children[index];

			if (child) {

				initialised = true;

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
